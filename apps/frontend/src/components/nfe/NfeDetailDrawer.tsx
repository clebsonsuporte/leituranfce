import { X, FileText, ExternalLink } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { useNfe } from '@/hooks/useNfes'
import {
  formatCurrency,
  formatCNPJ,
  formatChNFe,
  formatDateTime,
  getStatusColor,
  getStatusLabel,
} from '@/lib/utils'

interface NfeDetailDrawerProps {
  nfeId: string | null
  onClose: () => void
}

export default function NfeDetailDrawer({ nfeId, onClose }: NfeDetailDrawerProps) {
  const { data: nfe, isLoading } = useNfe(nfeId || undefined)

  if (!nfeId) return null

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />

      {/* Drawer */}
      <div className="fixed right-0 top-0 h-full w-[700px] max-w-full bg-white shadow-2xl z-50 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 shrink-0">
          <div className="flex items-center gap-3">
            <FileText className="h-5 w-5 text-primary-700" />
            <div>
              <h2 className="font-semibold text-gray-900">Detalhe da NF-e</h2>
              {nfe && (
                <p className="text-xs text-gray-400">
                  {nfe.mod === 65 ? 'NFC-e' : 'NF-e'} {nfe.serie}/{nfe.nNF}
                </p>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100">
            <X className="h-4 w-4 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="p-6 space-y-4">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-48 w-full" />
            </div>
          ) : !nfe ? (
            <div className="p-6 text-center text-gray-400">NF-e não encontrada</div>
          ) : (
            <Tabs defaultValue="geral" className="flex flex-col h-full">
              <div className="px-6 pt-4 border-b border-gray-100">
                <TabsList className="bg-transparent p-0 h-auto gap-1">
                  {['geral', 'itens', 'impostos', 'eventos'].map((tab) => (
                    <TabsTrigger
                      key={tab}
                      value={tab}
                      className="data-[state=active]:bg-primary-50 data-[state=active]:text-primary-800 rounded-md px-3 py-1.5 text-sm capitalize"
                    >
                      {tab === 'geral' ? 'Geral' : tab === 'itens' ? `Itens (${nfe.items?.length || 0})` : tab === 'impostos' ? 'Impostos' : `Eventos (${nfe.events?.length || 0})`}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>

              <TabsContent value="geral" className="p-6 m-0 space-y-4">
                {/* Status + Chave */}
                <div className="flex items-center gap-3">
                  <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${getStatusColor(nfe.status)}`}>
                    {getStatusLabel(nfe.status)}
                  </span>
                  <span className="text-xs text-gray-400">{nfe.mod === 65 ? 'NFC-e' : 'NF-e'} · Série {nfe.serie} · Nº {nfe.nNF}</span>
                </div>

                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500 mb-1">Chave de Acesso</p>
                  <p className="text-xs font-mono text-gray-800 break-all">
                    {formatChNFe(nfe.chNFe)}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <InfoField label="Data de Emissão" value={formatDateTime(nfe.dhEmi)} />
                  <InfoField label="Competência" value={nfe.competencia} />
                  <InfoField label="Tipo" value={nfe.tpNF === 0 ? 'Entrada' : 'Saída'} />
                  <InfoField label="Natureza da Operação" value={nfe.natOp || '-'} />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-lg border border-gray-200 p-4">
                    <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Emitente</p>
                    <p className="font-medium text-gray-900 text-sm">{nfe.emitNome}</p>
                    <p className="text-xs text-gray-400 mt-1">{formatCNPJ(nfe.emitCnpj)}</p>
                    {nfe.emitUF && <p className="text-xs text-gray-400">{nfe.emitUF}</p>}
                  </div>
                  <div className="rounded-lg border border-gray-200 p-4">
                    <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Destinatário</p>
                    <p className="font-medium text-gray-900 text-sm">{nfe.destNome || 'Consumidor Final'}</p>
                    {nfe.destCnpj && <p className="text-xs text-gray-400 mt-1">{formatCNPJ(nfe.destCnpj)}</p>}
                    {nfe.destCpf && <p className="text-xs text-gray-400 mt-1">{nfe.destCpf}</p>}
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="itens" className="m-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">#</TableHead>
                        <TableHead>Produto</TableHead>
                        <TableHead>NCM</TableHead>
                        <TableHead>CFOP</TableHead>
                        <TableHead className="text-right">Qtd</TableHead>
                        <TableHead className="text-right">Vl. Unit.</TableHead>
                        <TableHead className="text-right">Vl. Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(nfe.items || []).map((item: {
                        nItem: number
                        cProd?: string
                        xProd: string
                        ncm?: string
                        cfop: string
                        qCom: number
                        vUnCom: number
                        vProd: number
                        vICMS: number
                        vPIS: number
                        vCOFINS: number
                      }) => (
                        <TableRow key={item.nItem}>
                          <TableCell className="text-gray-400 text-xs">{item.nItem}</TableCell>
                          <TableCell>
                            <p className="text-sm font-medium">{item.xProd}</p>
                            {item.cProd && <p className="text-xs text-gray-400">{item.cProd}</p>}
                          </TableCell>
                          <TableCell className="text-xs text-gray-600">{item.ncm || '-'}</TableCell>
                          <TableCell className="text-xs">{item.cfop}</TableCell>
                          <TableCell className="text-right text-sm">{Number(item.qCom).toLocaleString('pt-BR', { maximumFractionDigits: 4 })}</TableCell>
                          <TableCell className="text-right text-sm">{formatCurrency(item.vUnCom)}</TableCell>
                          <TableCell className="text-right text-sm font-medium">{formatCurrency(item.vProd)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>

              <TabsContent value="impostos" className="p-6 m-0">
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: 'Valor dos Produtos', value: nfe.vProd },
                    { label: 'Desconto', value: nfe.vDesc },
                    { label: 'Frete', value: nfe.vFrete },
                    { label: 'Valor da NF-e', value: nfe.vNF, highlight: true },
                    { label: 'ICMS', value: nfe.vICMS },
                    { label: 'ICMS-ST', value: nfe.vICMSST },
                    { label: 'IPI', value: nfe.vIPI },
                    { label: 'PIS', value: nfe.vPIS },
                    { label: 'COFINS', value: nfe.vCOFINS },
                  ].map(({ label, value, highlight }) => (
                    <div
                      key={label}
                      className={`rounded-lg p-3 ${highlight ? 'bg-primary-50 border border-primary-200' : 'bg-gray-50'}`}
                    >
                      <p className="text-xs text-gray-500">{label}</p>
                      <p className={`text-base font-bold mt-1 ${highlight ? 'text-primary-800' : 'text-gray-900'}`}>
                        {formatCurrency(value)}
                      </p>
                    </div>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="eventos" className="p-6 m-0">
                {(!nfe.events || nfe.events.length === 0) ? (
                  <div className="text-center text-gray-400 py-8">Nenhum evento registrado</div>
                ) : (
                  <div className="space-y-3">
                    {nfe.events.map((event: {
                      id: string
                      tpEvento: string
                      nSeqEvento: number
                      dhEvento: string
                      xMotivo?: string
                      nProt?: string
                    }) => (
                      <div key={event.id} className="rounded-lg border border-gray-200 p-4">
                        <div className="flex items-center justify-between mb-2">
                          <Badge variant={event.tpEvento === '110111' ? 'destructive' : 'secondary'}>
                            {event.tpEvento === '110111' || event.tpEvento === '110112'
                              ? 'Cancelamento'
                              : `Evento ${event.tpEvento}`}
                          </Badge>
                          <span className="text-xs text-gray-400">{formatDateTime(event.dhEvento)}</span>
                        </div>
                        {event.xMotivo && (
                          <p className="text-sm text-gray-700">{event.xMotivo}</p>
                        )}
                        {event.nProt && (
                          <p className="text-xs text-gray-400 mt-1">Protocolo: {event.nProt}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          )}
        </div>
      </div>
    </>
  )
}

function InfoField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className="text-sm font-medium text-gray-900">{value}</p>
    </div>
  )
}
