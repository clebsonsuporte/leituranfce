import { useState, useRef, useEffect, useCallback } from 'react'
import { Calculator, AlertTriangle, CheckCircle, ChevronDown, ChevronUp, Info, BookOpen, Zap, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useTaxConsulta, useNcmSearch, TaxInput, NcmSugestao } from '@/hooks/useTax'

const UFS = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS',
  'MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC',
  'SP','SE','TO',
]

const REGIMES = [
  { value: 'simples',          label: 'Simples Nacional' },
  { value: 'mei',              label: 'MEI' },
  { value: 'lucro_presumido',  label: 'Lucro Presumido' },
  { value: 'lucro_real',       label: 'Lucro Real' },
]

const OPERACOES = [
  { value: 'venda',        label: 'Venda' },
  { value: 'transferencia',label: 'Transferência entre filiais' },
  { value: 'devolucao',    label: 'Devolução' },
  { value: 'remessa',      label: 'Remessa / Industrialização' },
  { value: 'importacao',   label: 'Importação' },
  { value: 'exportacao',   label: 'Exportação' },
]

const FORM_INITIAL: TaxInput = {
  produto: '',
  ncm: '',
  origem: 'SP',
  destino: 'SP',
  regime: 'lucro_presumido',
  tipoOperacao: 'venda',
  consumidorFinal: false,
  importado: false,
  cfopManual: '',
  valorUnitario: undefined,
}

// ─── NCM Combobox ─────────────────────────────────────────────────────────────

interface NcmComboboxProps {
  value: string
  onChange: (ncm: string) => void
  onSelectDescricao?: (descricao: string) => void
}

function NcmCombobox({ value, onChange, onSelectDescricao }: NcmComboboxProps) {
  const [query, setQuery]   = useState(value)
  const [debouncedQ, setDebouncedQ] = useState('')
  const [open, setOpen]     = useState(false)
  const [selected, setSelected] = useState<NcmSugestao | null>(null)
  const wrapperRef          = useRef<HTMLDivElement>(null)
  const inputRef            = useRef<HTMLInputElement>(null)
  const timerRef            = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { data: sugestoes = [], isFetching } = useNcmSearch(debouncedQ)

  // Sincroniza query com value externo (ex: reset de formulário)
  useEffect(() => {
    if (value === '') {
      setQuery('')
      setSelected(null)
    }
  }, [value])

  // Fecha dropdown ao clicar fora
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // Debounce de 400ms para não disparar a cada tecla
  const handleInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value
    setQuery(v)
    setSelected(null)
    setOpen(true)

    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      setDebouncedQ(v)
    }, 400)
  }, [])

  function handleSelect(item: NcmSugestao) {
    setSelected(item)
    setQuery(item.ncm)
    setDebouncedQ('')
    setOpen(false)
    onChange(item.ncm)
    onSelectDescricao?.(item.descricao)
  }

  function handleClear() {
    setSelected(null)
    setQuery('')
    setDebouncedQ('')
    setOpen(false)
    onChange('')
    inputRef.current?.focus()
  }

  // Modo automático: se só dígitos, considera que o user quer digitar NCM direto
  const isNcmDirect = /^\d+$/.test(query) && !selected

  return (
    <div ref={wrapperRef} className="relative">
      <div className="relative flex items-center">
        <Search className="absolute left-2.5 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleInput}
          onFocus={() => { if (sugestoes.length > 0) setOpen(true) }}
          placeholder="Ex: notebook, celular, 84713012…"
          maxLength={isNcmDirect ? 8 : undefined}
          className="w-full pl-8 pr-8 border border-gray-300 rounded-md py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {query && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-2 text-gray-400 hover:text-gray-600"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Resultado selecionado */}
      {selected && (
        <p className="text-xs text-blue-600 mt-1 leading-snug line-clamp-2">
          ✓ {selected.ncm} — {selected.descricao}
        </p>
      )}

      {/* Hint modo direto */}
      {isNcmDirect && !selected && (
        <p className="text-xs text-gray-400 mt-0.5">
          Digitando NCM diretamente ({query.length}/8 dígitos)
        </p>
      )}

      {/* Dropdown */}
      {open && query.trim().length >= 2 && (
        <div className="absolute z-50 top-full mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
          {isFetching && (
            <div className="px-3 py-2 text-xs text-gray-400 flex items-center gap-2">
              <span className="animate-spin inline-block">⟳</span> Buscando na TIPI…
            </div>
          )}
          {!isFetching && sugestoes.length === 0 && debouncedQ.length >= 2 && (
            <div className="px-3 py-2 text-xs text-gray-400">
              Nenhum NCM encontrado para "{debouncedQ}". Tente outros termos.
            </div>
          )}
          {sugestoes.map(item => (
            <button
              key={item.ncm}
              type="button"
              onMouseDown={() => handleSelect(item)}
              className="w-full text-left px-3 py-2.5 hover:bg-blue-50 border-b border-gray-100 last:border-0 transition-colors"
            >
              <div className="flex items-start gap-2">
                <span className="font-mono text-xs font-bold text-blue-700 whitespace-nowrap mt-0.5">
                  {item.ncm}
                </span>
                <span className="text-xs text-gray-700 leading-snug line-clamp-2">
                  {item.descricao}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pct(n: number) {
  return `${n.toFixed(2)}%`
}

function TagBadge({ label, color = 'blue' }: { label: string; color?: string }) {
  const colors: Record<string, string> = {
    blue:   'bg-blue-100 text-blue-800',
    green:  'bg-green-100 text-green-800',
    red:    'bg-red-100 text-red-800',
    yellow: 'bg-yellow-100 text-yellow-800',
    purple: 'bg-purple-100 text-purple-800',
    gray:   'bg-gray-100 text-gray-700',
    orange: 'bg-orange-100 text-orange-800',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${colors[color] ?? colors.blue}`}>
      {label}
    </span>
  )
}

function Section({ title, icon, children, defaultOpen = true, badge }: {
  title: string; icon?: React.ReactNode; children: React.ReactNode
  defaultOpen?: boolean; badge?: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
      >
        <div className="flex items-center gap-2 font-semibold text-gray-800 text-sm">
          {icon}
          {title}
          {badge}
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
      </button>
      {open && <div className="p-4">{children}</div>}
    </div>
  )
}

function AliquotaRow({ label, value, sublabel, highlight }: {
  label: string; value: string; sublabel?: string; highlight?: boolean
}) {
  return (
    <div className={`flex items-center justify-between py-2 border-b border-gray-100 last:border-0 ${highlight ? 'bg-blue-50 -mx-4 px-4' : ''}`}>
      <div>
        <span className="text-sm text-gray-700">{label}</span>
        {sublabel && <p className="text-xs text-gray-400 mt-0.5">{sublabel}</p>}
      </div>
      <span className={`text-sm font-bold ${highlight ? 'text-blue-700' : 'text-gray-900'}`}>{value}</span>
    </div>
  )
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function TaxPage() {
  const [form, setForm] = useState<TaxInput>(FORM_INITIAL)
  const { mutate, data: resultado, isPending, error } = useTaxConsulta()

  function setField<K extends keyof TaxInput>(key: K, value: TaxInput[K]) {
    setForm(f => ({ ...f, [key]: value }))
  }

  function handleConsultar() {
    mutate(form)
  }

  const hasResult = !!resultado

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Calculator className="h-5 w-5 text-blue-600" />
            Consulta Tributária Inteligente
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Motor de cálculo tributário contextual — ICMS, IPI, PIS/COFINS, DIFAL, FCP, Reforma Tributária
          </p>
        </div>
        <div className="flex items-center gap-1.5 bg-blue-50 border border-blue-200 rounded-lg px-3 py-1.5">
          <BookOpen className="h-3.5 w-3.5 text-blue-600" />
          <span className="text-xs text-blue-700 font-medium">Fontes: RF, SENADO, LC 214/2025</span>
        </div>
      </div>

      <div className={`grid gap-6 ${hasResult ? 'grid-cols-1 xl:grid-cols-5' : 'grid-cols-1 max-w-2xl'}`}>

        {/* ─── Formulário ─────────────────────────────────────────────────── */}
        <div className={`space-y-4 ${hasResult ? 'xl:col-span-2' : ''}`}>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Dados da Operação</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">

              {/* Produto */}
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Produto / Descrição</label>
                <input
                  type="text"
                  value={form.produto}
                  onChange={e => setField('produto', e.target.value)}
                  placeholder="Ex: Notebook Dell Inspiron 15"
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* NCM */}
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">
                  NCM
                  <span className="text-gray-400"> — digite a descrição ou o código</span>
                </label>
                <NcmCombobox
                  value={form.ncm}
                  onChange={ncm => setField('ncm', ncm.replace(/\D/g, '').substring(0, 8))}
                  onSelectDescricao={desc =>
                    setForm(f => ({ ...f, produto: f.produto || desc.substring(0, 80) }))
                  }
                />
                <p className="text-xs text-gray-400 mt-0.5">
                  Fonte: TIPI via{' '}
                  <a href="https://brasilapi.com.br" target="_blank" rel="noreferrer" className="text-blue-500 underline">BrasilAPI</a>
                  {' · '}
                  <a href="https://www.receita.fazenda.gov.br/aliquotas/ncm.asp" target="_blank" rel="noreferrer" className="text-blue-500 underline">NCM Receita Federal</a>
                </p>
              </div>

              {/* Origem / Destino */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">UF Origem</label>
                  <Select value={form.origem} onValueChange={v => setField('origem', v as TaxInput['origem'])}>
                    <SelectTrigger className="text-sm h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {UFS.map(uf => <SelectItem key={uf} value={uf}>{uf}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">UF Destino</label>
                  <Select value={form.destino} onValueChange={v => setField('destino', v as TaxInput['destino'])}>
                    <SelectTrigger className="text-sm h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {UFS.map(uf => <SelectItem key={uf} value={uf}>{uf}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Regime */}
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Regime Tributário</label>
                <Select value={form.regime} onValueChange={v => setField('regime', v as TaxInput['regime'])}>
                  <SelectTrigger className="text-sm h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REGIMES.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {/* Tipo Operação */}
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Tipo de Operação</label>
                <Select value={form.tipoOperacao} onValueChange={v => setField('tipoOperacao', v as TaxInput['tipoOperacao'])}>
                  <SelectTrigger className="text-sm h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {OPERACOES.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {/* CFOP manual */}
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">CFOP Manual (opcional)</label>
                <input
                  type="text"
                  value={form.cfopManual ?? ''}
                  onChange={e => setField('cfopManual', e.target.value)}
                  placeholder="Ex: 5.102"
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Valor unitário */}
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Valor Unitário (R$) — opcional</label>
                <input
                  type="number"
                  value={form.valorUnitario ?? ''}
                  onChange={e => setField('valorUnitario', e.target.value ? parseFloat(e.target.value) : undefined)}
                  placeholder="0,00"
                  step="0.01"
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Checkboxes */}
              <div className="space-y-2 pt-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.consumidorFinal}
                    onChange={e => setField('consumidorFinal', e.target.checked)}
                    className="rounded border-gray-300 text-blue-600"
                  />
                  <span className="text-sm text-gray-700">Consumidor Final</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.importado}
                    onChange={e => setField('importado', e.target.checked)}
                    className="rounded border-gray-300 text-blue-600"
                  />
                  <span className="text-sm text-gray-700">Produto Importado</span>
                  <span className="text-xs text-gray-400">(4% interestadual)</span>
                </label>
              </div>

              <Button
                onClick={handleConsultar}
                disabled={!form.ncm || !form.origem || !form.destino || isPending}
                className="w-full gap-2 mt-2"
              >
                {isPending ? (
                  <><span className="animate-spin">⟳</span> Calculando...</>
                ) : (
                  <><Calculator className="h-4 w-4" /> Calcular Tributos</>
                )}
              </Button>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-700">
                  Erro: {(error as { message?: string }).message ?? 'Tente novamente'}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ─── Resultado ──────────────────────────────────────────────────── */}
        {hasResult && resultado && (
          <div className="xl:col-span-3 space-y-3">

            {/* Identificação */}
            <div className="bg-blue-600 text-white rounded-lg p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-blue-200 mb-1">Consulta Tributária</p>
                  <h2 className="font-bold text-lg leading-tight">{resultado.produto || 'Produto'}</h2>
                  <p className="text-blue-200 text-sm mt-0.5">
                    NCM {resultado.ncm} · {resultado.ncmDescricao}
                  </p>
                </div>
                <div className="text-right text-sm">
                  <div className="text-blue-200">{resultado.origem} → {resultado.destino}</div>
                  <TagBadge
                    label={resultado.mesmaUF ? 'Operação Interna' : 'Interestadual'}
                    color={resultado.mesmaUF ? 'green' : 'blue'}
                  />
                </div>
              </div>
            </div>

            {/* Alertas */}
            {resultado.alertas.length > 0 && (
              <div className="space-y-1.5">
                {resultado.alertas.map((a: string, i: number) => (
                  <div key={i} className={`flex items-start gap-2 text-sm p-2.5 rounded-md border ${
                    a.startsWith('⚠️') ? 'bg-yellow-50 border-yellow-200 text-yellow-800' :
                    a.startsWith('📋') ? 'bg-blue-50 border-blue-200 text-blue-800' :
                    'bg-gray-50 border-gray-200 text-gray-700'
                  }`}>
                    <span className="flex-shrink-0">{a.substring(0,2)}</span>
                    <span>{a.substring(2)}</span>
                  </div>
                ))}
              </div>
            )}

            {/* ICMS */}
            <Section
              title="ICMS"
              icon={<span className="text-base">🏛️</span>}
              badge={<TagBadge label={`${resultado.icms.aliquotaAplicada}%`} color="blue" />}
            >
              <AliquotaRow
                label="Alíquota Aplicada"
                value={pct(resultado.icms.aliquotaAplicada)}
                sublabel={resultado.icms.tipoOperacao}
                highlight
              />
              {!resultado.mesmaUF && resultado.icms.aliquotaInterestadual !== null && (
                <AliquotaRow
                  label="Alíquota Interestadual"
                  value={pct(resultado.icms.aliquotaInterestadual)}
                  sublabel="Resolução SENADO 22/1989 ou 13/2012"
                />
              )}
              <AliquotaRow
                label={`Alíquota Interna ${resultado.origem}`}
                value={pct(resultado.icms.aliquotaInternaOrigem)}
              />
              {!resultado.mesmaUF && (
                <AliquotaRow
                  label={`Alíquota Interna ${resultado.destino}`}
                  value={pct(resultado.icms.aliquotaInternaDestino)}
                />
              )}
              <p className="text-xs text-gray-400 mt-2">
                <strong>Base:</strong> {resultado.icms.baseCalculo}
              </p>
              <p className="text-xs text-gray-400">
                <strong>Fundamento:</strong> {resultado.icms.fundamentoLegal}
              </p>
              {resultado.icms.observacao && (
                <p className="text-xs text-blue-600 mt-1">{resultado.icms.observacao}</p>
              )}
            </Section>

            {/* DIFAL */}
            {resultado.difal?.aplicavel && (
              <Section
                title="DIFAL — Diferencial de Alíquota"
                icon={<AlertTriangle className="h-4 w-4 text-yellow-500" />}
                badge={<TagBadge label={`${resultado.difal.aliquotaDifal.toFixed(1)}%`} color="yellow" />}
              >
                <AliquotaRow
                  label="DIFAL"
                  value={pct(resultado.difal.aliquotaDifal)}
                  highlight
                />
                <AliquotaRow label="Destinação" value={resultado.difal.partilhaMgGov} />
                <p className="text-xs text-gray-400 mt-2">{resultado.difal.fundamentoLegal}</p>
                {resultado.difal.observacao && (
                  <p className="text-xs text-yellow-700 mt-1">{resultado.difal.observacao}</p>
                )}
              </Section>
            )}

            {/* ICMS-ST */}
            <Section
              title="ICMS-ST (Substituição Tributária)"
              icon={<span className="text-base">🔄</span>}
              badge={
                <TagBadge
                  label={resultado.icmsST.aplicavel ? 'APLICÁVEL' : 'Não identificada'}
                  color={resultado.icmsST.aplicavel ? 'red' : 'gray'}
                />
              }
            >
              {resultado.icmsST.aplicavel ? (
                <>
                  <AliquotaRow label="Produto" value={resultado.icmsST.produtos ?? '—'} highlight />
                  <AliquotaRow label="Convênio" value={resultado.icmsST.convenio ?? '—'} />
                </>
              ) : (
                <p className="text-sm text-gray-500">{resultado.icmsST.observacao}</p>
              )}
              {resultado.icmsST.observacao && resultado.icmsST.aplicavel && (
                <p className="text-xs text-orange-600 mt-2">{resultado.icmsST.observacao}</p>
              )}
            </Section>

            {/* FCP */}
            {resultado.fcp && (
              <Section
                title="FCP — Fundo de Combate à Pobreza"
                icon={<span className="text-base">🏦</span>}
                badge={<TagBadge label={`${resultado.fcp.aliquota}%`} color="orange" />}
              >
                <AliquotaRow
                  label={`FCP ${resultado.fcp.uf}`}
                  value={pct(resultado.fcp.aliquota)}
                  highlight
                />
                {resultado.fcp.observacao && (
                  <p className="text-xs text-gray-500 mt-2">{resultado.fcp.observacao}</p>
                )}
              </Section>
            )}

            {/* IPI */}
            <Section
              title="IPI — Imposto sobre Produtos Industrializados"
              icon={<span className="text-base">🏭</span>}
              badge={<TagBadge label={`${resultado.ipi.aliquota}%`} color="purple" />}
            >
              <AliquotaRow label="Alíquota IPI" value={pct(resultado.ipi.aliquota)} highlight />
              <AliquotaRow label="Capítulo NCM" value={`Cap. ${resultado.ipi.capitulo} — ${resultado.ipi.descricaoCapitulo}`} />
              <AliquotaRow label="Fundamento" value={resultado.ipi.fundamentoLegal} />
              {resultado.ipi.observacao && (
                <p className="text-xs text-purple-600 mt-2">{resultado.ipi.observacao}</p>
              )}
            </Section>

            {/* PIS/COFINS */}
            <Section
              title="PIS / COFINS"
              icon={<span className="text-base">💰</span>}
              badge={
                <TagBadge
                  label={`${resultado.pisCofins.aliquotaPis + resultado.pisCofins.aliquotaCofins}%`}
                  color="green"
                />
              }
            >
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-green-50 rounded p-3">
                  <p className="text-xs text-green-600 font-semibold mb-1">PIS</p>
                  <p className="text-xl font-bold text-green-700">{pct(resultado.pisCofins.aliquotaPis)}</p>
                  <p className="text-xs text-green-600">{resultado.pisCofins.regimePis}</p>
                  <p className="text-xs text-gray-400 mt-0.5">CST: {resultado.pisCofins.cstPis}</p>
                </div>
                <div className="bg-green-50 rounded p-3">
                  <p className="text-xs text-green-600 font-semibold mb-1">COFINS</p>
                  <p className="text-xl font-bold text-green-700">{pct(resultado.pisCofins.aliquotaCofins)}</p>
                  <p className="text-xs text-green-600">{resultado.pisCofins.regimeCofins}</p>
                  <p className="text-xs text-gray-400 mt-0.5">CST: {resultado.pisCofins.cstCofins}</p>
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-2">{resultado.pisCofins.observacao}</p>
            </Section>

            {/* CST / CSOSN */}
            <Section
              title="CST / CSOSN Sugerido"
              icon={<span className="text-base">🏷️</span>}
              defaultOpen={false}
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">CST — Regime Normal</p>
                  {resultado.cst.map((c: { cst: string; descricao: string; observacao?: string }, i: number) => (
                    <div key={i} className="mb-2 p-2 bg-gray-50 rounded border">
                      <div className="flex items-center gap-2">
                        <TagBadge label={`CST ${c.cst}`} color="blue" />
                      </div>
                      <p className="text-xs text-gray-600 mt-1">{c.descricao}</p>
                      {c.observacao && <p className="text-xs text-blue-500 mt-0.5">{c.observacao}</p>}
                    </div>
                  ))}
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">CSOSN — Simples Nacional</p>
                  {resultado.csosn.map((c: { csosn: string; descricao: string; observacao?: string }, i: number) => (
                    <div key={i} className="mb-2 p-2 bg-gray-50 rounded border">
                      <div className="flex items-center gap-2">
                        <TagBadge label={`CSOSN ${c.csosn}`} color="purple" />
                      </div>
                      <p className="text-xs text-gray-600 mt-1">{c.descricao}</p>
                      {c.observacao && <p className="text-xs text-purple-500 mt-0.5">{c.observacao}</p>}
                    </div>
                  ))}
                </div>
              </div>
            </Section>

            {/* CFOP */}
            <Section
              title="CFOP Sugerido"
              icon={<span className="text-base">📋</span>}
              defaultOpen={false}
            >
              <div className="space-y-2">
                {resultado.cfopSugestoes.map((c: { cfop: string; descricao: string; observacao?: string }, i: number) => (
                  <div key={i} className="flex items-start gap-3 p-2 bg-gray-50 rounded border">
                    <TagBadge label={c.cfop} color="blue" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-700">{c.descricao}</p>
                      {c.observacao && <p className="text-xs text-blue-500 mt-0.5">{c.observacao}</p>}
                    </div>
                    {i === 0 && <TagBadge label="Principal" color="green" />}
                  </div>
                ))}
              </div>
            </Section>

            {/* Benefícios Fiscais */}
            {resultado.beneficiosFiscais.length > 0 && (
              <Section
                title="Benefícios Fiscais"
                icon={<CheckCircle className="h-4 w-4 text-green-500" />}
                defaultOpen={false}
              >
                <div className="space-y-1.5">
                  {resultado.beneficiosFiscais.map((b: string, i: number) => (
                    <div key={i} className="flex items-start gap-2 text-sm text-gray-700 p-2 bg-green-50 rounded border border-green-100">
                      <CheckCircle className="h-3.5 w-3.5 text-green-500 flex-shrink-0 mt-0.5" />
                      {b}
                    </div>
                  ))}
                </div>
                <p className="text-xs text-gray-400 mt-2">
                  Verificar vigência e requisitos na SEFAZ estadual.
                </p>
              </Section>
            )}

            {/* Reforma Tributária */}
            <Section
              title="Reforma Tributária — LC 214/2025"
              icon={<Zap className="h-4 w-4 text-yellow-500" />}
              defaultOpen={true}
              badge={<TagBadge label="IBS/CBS/IS" color="yellow" />}
            >
              {/* Transição atual */}
              <div className="mb-3 p-3 bg-yellow-50 border border-yellow-200 rounded">
                <p className="text-xs font-semibold text-yellow-700 mb-1">
                  Período atual — {resultado.reformaTributaria.transicaoAtual.ano}
                </p>
                <p className="text-xs text-yellow-600">{resultado.reformaTributaria.transicaoAtual.observacao}</p>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-3">
                <div className="bg-blue-50 rounded p-3">
                  <p className="text-xs text-blue-600 font-semibold mb-1">CBS (substitui PIS/COFINS)</p>
                  <p className="text-xl font-bold text-blue-700">{pct(resultado.reformaTributaria.cbs.aliquota)}</p>
                  <p className="text-xs text-blue-500 mt-1">{resultado.reformaTributaria.cbs.observacao}</p>
                </div>
                <div className="bg-indigo-50 rounded p-3">
                  <p className="text-xs text-indigo-600 font-semibold mb-1">IBS (substitui ICMS+ISS)</p>
                  <p className="text-xl font-bold text-indigo-700">{pct(resultado.reformaTributaria.ibs.aliquotaEstimada)}</p>
                  <p className="text-xs text-indigo-500 mt-1">Estimativa de transição. Alíquota plena ~{resultado.reformaTributaria.ibs.aliquotaEstimada > 0 ? resultado.reformaTributaria.ibs.aliquotaEstimada : '26,5'}% em 2033</p>
                </div>
              </div>

              {/* Imposto Seletivo */}
              {resultado.reformaTributaria.impostoSeletivo.aplicavel && (
                <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold text-red-700">⚠️ Imposto Seletivo (IS)</p>
                      <p className="text-xs text-red-600">{resultado.reformaTributaria.impostoSeletivo.descricao}</p>
                      <p className="text-xs text-red-400 mt-0.5">{resultado.reformaTributaria.impostoSeletivo.baseLegal}</p>
                    </div>
                    <TagBadge
                      label={`${resultado.reformaTributaria.impostoSeletivo.aliquota}%`}
                      color="red"
                    />
                  </div>
                </div>
              )}

              {/* Reduções */}
              {resultado.reformaTributaria.reducoes.length > 0 && (
                <div className="mb-3 space-y-1.5">
                  <p className="text-xs font-semibold text-gray-500">Reduções de Alíquota Aplicáveis</p>
                  {resultado.reformaTributaria.reducoes.map((r: { descricao: string; reducao: number; base: string }, i: number) => (
                    <div key={i} className="flex items-center justify-between p-2 bg-green-50 rounded border border-green-100 text-xs">
                      <div>
                        <span className="text-green-800 font-medium">{r.descricao}</span>
                        <p className="text-green-600">{r.base}</p>
                      </div>
                      <TagBadge label={`-${r.reducao}%`} color="green" />
                    </div>
                  ))}
                </div>
              )}

              {/* Comparativo */}
              <div className="border border-gray-200 rounded p-3">
                <p className="text-xs font-semibold text-gray-600 mb-2">
                  📊 Impacto Comparativo (R$ 100 de base)
                </p>
                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <p className="text-xs text-gray-400">Sistema Atual</p>
                    <p className="text-lg font-bold text-gray-700">
                      R$ {resultado.reformaTributaria.impactoComparativo.tributoAtualEstimado.toFixed(2)}
                    </p>
                  </div>
                  <div className="text-2xl text-gray-300">→</div>
                  <div className="flex-1">
                    <p className="text-xs text-gray-400">Reforma ({resultado.reformaTributaria.transicaoAtual.ano})</p>
                    <p className="text-lg font-bold text-blue-700">
                      R$ {resultado.reformaTributaria.impactoComparativo.tributoReformaEstimado.toFixed(2)}
                    </p>
                  </div>
                  <div className={`px-2 py-1 rounded text-sm font-bold ${
                    resultado.reformaTributaria.impactoComparativo.variacaoPercentual > 0
                      ? 'bg-red-100 text-red-700'
                      : 'bg-green-100 text-green-700'
                  }`}>
                    {resultado.reformaTributaria.impactoComparativo.variacaoPercentual > 0 ? '+' : ''}
                    {resultado.reformaTributaria.impactoComparativo.variacaoPercentual.toFixed(1)}%
                  </div>
                </div>
                <p className="text-xs text-gray-400 mt-2">
                  {resultado.reformaTributaria.impactoComparativo.observacao}
                </p>
              </div>

              {/* Tabela de transição */}
              <div className="mt-3">
                <p className="text-xs font-semibold text-gray-500 mb-1.5">Cronograma de Transição (LC 214/2025)</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="px-2 py-1.5 text-left border border-gray-200">Ano</th>
                        <th className="px-2 py-1.5 text-center border border-gray-200">CBS</th>
                        <th className="px-2 py-1.5 text-center border border-gray-200">IBS</th>
                        <th className="px-2 py-1.5 text-left border border-gray-200">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resultado.reformaTributaria.transicaoAtual && [
                        { ano: 2026, cbs: 0.9,  ibs: 0,    observacao: 'Ano-teste' },
                        { ano: 2027, cbs: 9.9,  ibs: 0,    observacao: 'CBS plena' },
                        { ano: 2028, cbs: 9.9,  ibs: 3.25, observacao: 'IBS inicia' },
                        { ano: 2030, cbs: 9.9,  ibs: 9.75, observacao: 'IBS fase 3' },
                        { ano: 2033, cbs: 9.9,  ibs: 26.5, observacao: 'Regime pleno' },
                      ].map(t => (
                        <tr
                          key={t.ano}
                          className={`${t.ano === resultado.reformaTributaria.transicaoAtual.ano ? 'bg-blue-50 font-semibold' : ''}`}
                        >
                          <td className="px-2 py-1 border border-gray-200">
                            {t.ano}
                            {t.ano === resultado.reformaTributaria.transicaoAtual.ano && (
                              <span className="ml-1 text-blue-600">←</span>
                            )}
                          </td>
                          <td className="px-2 py-1 border border-gray-200 text-center">{t.cbs}%</td>
                          <td className="px-2 py-1 border border-gray-200 text-center">{t.ibs}%</td>
                          <td className="px-2 py-1 border border-gray-200 text-gray-500">{t.observacao}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </Section>

            {/* Fontes */}
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
              <div className="flex items-center gap-1.5 mb-2">
                <Info className="h-3.5 w-3.5 text-gray-400" />
                <p className="text-xs font-semibold text-gray-500">Fontes Legais Utilizadas</p>
              </div>
              <div className="flex flex-wrap gap-1">
                {resultado.fontesDados.map((f: string, i: number) => (
                  <TagBadge key={i} label={f} color="gray" />
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-2">
                ⚠️ Esta consulta é informativa. Confirme sempre com a legislação estadual específica e consultoria tributária.
              </p>
            </div>

          </div>
        )}
      </div>
    </div>
  )
}
