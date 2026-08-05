import { useState } from 'react'
import {
  FileText, Download, Loader2, Table2, BarChart3, FileSpreadsheet, File,
  ArrowDownUp, ShoppingBag, Tag, Package, FileArchive,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from '@/components/ui/toast'
import { useFilterStore } from '@/stores/filterStore'
import { useCompanies } from '@/hooks/useCompanies'
import { formatCNPJ, formatCompetencia, competenciaOptions } from '@/lib/utils'
import api from '@/lib/api'

// ─── Report type definitions ──────────────────────────────────────────────────

const REPORT_GROUPS = [
  {
    label: 'Documentos Fiscais',
    types: [
      {
        value: 'entradas-saidas',
        label: 'Entradas e Saídas',
        icon: ArrowDownUp,
        color: 'text-blue-700',
        bg: 'bg-blue-50 border-blue-200',
        activeBg: 'border-blue-600 bg-blue-50',
        desc: 'Todos os documentos NF-e e NFC-e do período com totais de impostos',
        formats: ['pdf', 'csv'],
      },
    ],
  },
  {
    label: 'PIS / COFINS por Itens',
    types: [
      {
        value: 'monofasico-5102',
        label: 'Monofásico — CFOP 5102',
        icon: Tag,
        color: 'text-teal-700',
        bg: 'bg-teal-50 border-teal-200',
        activeBg: 'border-teal-600 bg-teal-50',
        desc: 'Produtos vendidos com tributação monofásica (revenda normal — CFOP 5.102)',
        formats: ['pdf', 'csv'],
        tag: '5102',
      },
      {
        value: 'monofasico-5405',
        label: 'Monofásico — CFOP 5405/6404',
        icon: Package,
        color: 'text-indigo-700',
        bg: 'bg-indigo-50 border-indigo-200',
        activeBg: 'border-indigo-600 bg-indigo-50',
        desc: 'Produtos vendidos com tributação monofásica e ICMS-ST (CFOP 5.405 / 6.404)',
        formats: ['pdf', 'csv'],
        tag: '5405',
      },
      {
        value: 'st',
        label: 'Substituição Tributária',
        icon: ShoppingBag,
        color: 'text-purple-700',
        bg: 'bg-purple-50 border-purple-200',
        activeBg: 'border-purple-600 bg-purple-50',
        desc: 'Produtos com ICMS-ST (CSOSN 500/201/202/203 ou CST 10/30/60/70)',
        formats: ['pdf', 'csv'],
        tag: 'ST',
      },
    ],
  },
  {
    label: 'Arquivos Fonte',
    types: [
      {
        value: 'xml-zip',
        label: 'Exportar XMLs (.zip)',
        icon: FileArchive,
        color: 'text-emerald-700',
        bg: 'bg-emerald-50 border-emerald-200',
        activeBg: 'border-emerald-600 bg-emerald-50',
        desc: 'Cópia fiel do relatório: XMLs originais do período exatamente como importados do Drive — autorizadas, canceladas e inutilizadas juntas, só sem protocolo fica de fora',
        formats: ['zip'],
      },
    ],
  },
  {
    label: 'Relatórios Gerenciais',
    types: [
      {
        value: 'sintetico',
        label: 'Sintético',
        icon: BarChart3,
        color: 'text-primary-700',
        bg: 'bg-primary-50 border-primary-200',
        activeBg: 'border-primary-600 bg-primary-50',
        desc: 'Resumo executivo com KPIs e totais por imposto',
        formats: ['pdf', 'excel', 'csv'],
      },
      {
        value: 'analitico',
        label: 'Analítico',
        icon: Table2,
        color: 'text-gray-700',
        bg: 'bg-gray-50 border-gray-200',
        activeBg: 'border-gray-600 bg-gray-50',
        desc: 'Listagem completa de todas as NF-e com impostos (até 1.000 notas)',
        formats: ['pdf', 'excel', 'csv'],
      },
    ],
  },
]

const ALL_TYPES = REPORT_GROUPS.flatMap(g => g.types)

const FORMAT_LABELS: Record<string, string> = { pdf: 'PDF', excel: 'Excel (.xlsx)', csv: 'CSV', zip: 'ZIP' }
const FORMAT_ICONS: Record<string, React.ElementType> = { pdf: File, excel: FileSpreadsheet, csv: Table2, zip: FileArchive }

// ─── Component ────────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const { selectedCompanyId } = useFilterStore()
  const [reportType, setReportType] = useState('entradas-saidas')
  const [format, setFormat] = useState('pdf')
  const [competencia, setCompetencia] = useState(useFilterStore.getState().selectedCompetencia || '_all')
  const [isGenerating, setIsGenerating] = useState(false)

  const { data: companies = [] } = useCompanies()
  const competOpts = competenciaOptions(24)

  const selectedTypeDef = ALL_TYPES.find(t => t.value === reportType)!

  // When switching report type, reset format if not available
  function handleSelectType(val: string) {
    setReportType(val)
    const def = ALL_TYPES.find(t => t.value === val)
    if (def && !def.formats.includes(format)) {
      setFormat(def.formats[0])
    }
  }

  async function handleGenerate() {
    setIsGenerating(true)
    try {
      const { data } = await api.post('/reports/generate', {
        type: reportType,
        format,
        companyId: selectedCompanyId || undefined,
        competencia: competencia === '_all' ? undefined : competencia,
      })

      const response = await api.get(data.downloadUrl, { responseType: 'blob' })
      const contentType = response.headers['content-type']
      const blob = new Blob([response.data], {
        type: typeof contentType === 'string' ? contentType : 'application/octet-stream',
      })
      const objectUrl = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = objectUrl
      link.download = data.filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(objectUrl)

      toast.success('Relatório gerado!', `${data.filename} baixado com sucesso`)
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string; details?: string } } }
      let errMsg = error.response?.data?.details || error.response?.data?.error
      if (!errMsg && error.response?.data instanceof Blob) {
        try {
          const text = await (error.response.data as Blob).text()
          const json = JSON.parse(text)
          errMsg = json.details || json.error
        } catch { /* ignore */ }
      }
      toast.error('Erro ao gerar relatório', errMsg || 'Tente novamente')
    } finally {
      setIsGenerating(false)
    }
  }

  const selectedCompany = companies.find((c) => c.id === selectedCompanyId)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Relatórios</h1>
        <p className="text-sm text-gray-500 mt-0.5">Gere relatórios fiscais em PDF ou CSV conforme modelos contábeis</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Left: Type selector */}
        <div className="xl:col-span-2 space-y-5">

          {/* Report type groups */}
          {REPORT_GROUPS.map(group => (
            <Card key={group.label}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-gray-600 font-semibold uppercase tracking-wide">
                  {group.label}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="grid grid-cols-1 gap-2">
                  {group.types.map(rt => {
                    const Icon = rt.icon
                    const isSelected = reportType === rt.value
                    return (
                      <button
                        key={rt.value}
                        onClick={() => handleSelectType(rt.value)}
                        className={`flex items-center gap-3 p-3.5 rounded-lg border-2 text-left transition-all ${
                          isSelected ? rt.activeBg + ' shadow-sm' : 'border-gray-200 hover:border-gray-300 bg-white'
                        }`}
                      >
                        <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${
                          isSelected ? rt.bg : 'bg-gray-100'
                        }`}>
                          <Icon className={`h-4 w-4 ${isSelected ? rt.color : 'text-gray-500'}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className={`text-sm font-semibold ${isSelected ? rt.color : 'text-gray-800'}`}>
                              {rt.label}
                            </p>
                            {'tag' in rt && (
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                isSelected ? rt.bg + ' ' + rt.color : 'bg-gray-100 text-gray-500'
                              }`}>
                                CFOP {(rt as { tag: string }).tag}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5 truncate">{rt.desc}</p>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          {rt.formats.map(f => (
                            <span key={f} className="text-[9px] border border-gray-200 rounded px-1 text-gray-400">
                              {f.toUpperCase()}
                            </span>
                          ))}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          ))}

          {/* Format selector */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Formato de Saída</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="flex gap-2">
                {selectedTypeDef.formats.map(f => {
                  const Icon = FORMAT_ICONS[f] || File
                  return (
                    <button
                      key={f}
                      onClick={() => setFormat(f)}
                      className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border-2 text-sm font-medium transition-all ${
                        format === f
                          ? 'border-primary-600 bg-primary-50 text-primary-800'
                          : 'border-gray-200 hover:border-gray-300 text-gray-600'
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      {FORMAT_LABELS[f]}
                    </button>
                  )
                })}
              </div>
            </CardContent>
          </Card>

          {/* Filters */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Filtros</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1">Competência</label>
                  <Select value={competencia} onValueChange={setCompetencia}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_all">Todas as competências</SelectItem>
                      {competOpts.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1">Empresa</label>
                  <div className="h-9 px-3 rounded-md border border-gray-200 bg-gray-50 flex items-center text-sm text-gray-600">
                    {selectedCompany ? selectedCompany.name : 'Todas as empresas'}
                  </div>
                  <p className="text-xs text-gray-400 mt-1">Altere no filtro global do cabeçalho</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right: Summary + Generate */}
        <div>
          <Card className="sticky top-20">
            <CardHeader>
              <CardTitle>Resumo</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Selected type preview */}
              <div className={`flex items-start gap-3 p-3 rounded-lg border ${selectedTypeDef.bg}`}>
                {(() => { const Icon = selectedTypeDef.icon; return <Icon className={`h-5 w-5 mt-0.5 shrink-0 ${selectedTypeDef.color}`} /> })()}
                <div>
                  <p className={`text-sm font-bold ${selectedTypeDef.color}`}>{selectedTypeDef.label}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{selectedTypeDef.desc}</p>
                </div>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Formato:</span>
                  <span className="font-semibold">{FORMAT_LABELS[format]}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Empresa:</span>
                  <span className="font-medium text-right max-w-[130px] truncate">
                    {selectedCompany ? selectedCompany.name : 'Todas'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Competência:</span>
                  <span className="font-medium">
                    {competencia && competencia !== '_all' ? formatCompetencia(competencia) : 'Todas'}
                  </span>
                </div>
              </div>

              <div className="pt-3 border-t border-gray-100">
                <Button onClick={handleGenerate} disabled={isGenerating} className="w-full gap-2">
                  {isGenerating ? (
                    <><Loader2 className="h-4 w-4 animate-spin" />Gerando...</>
                  ) : (
                    <><Download className="h-4 w-4" />Gerar e Baixar</>
                  )}
                </Button>
              </div>

              <p className="text-xs text-gray-400 text-center">
                O arquivo será gerado e baixado automaticamente
              </p>

              {/* Info box */}
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 space-y-1">
                <p className="font-semibold">ℹ️ Sobre os relatórios de itens</p>
                <p>Os relatórios Monofásico e ST são gerados a partir dos dados de CST PIS/COFINS e CSOSN/CST ICMS de cada item importado.</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
