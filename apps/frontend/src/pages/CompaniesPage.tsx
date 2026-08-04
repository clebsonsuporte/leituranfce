import { useState } from 'react'
import { Plus, Building2, Search, Edit2, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import CertificateTab from '@/components/companies/CertificateTab'
import { useCompanies, useCreateCompany, useUpdateCompany, useDeleteCompany } from '@/hooks/useCompanies'
import { toast } from '@/components/ui/toast'
import { formatCNPJ, formatDateTime } from '@/lib/utils'

interface CompanyFormData {
  cnpj: string
  name: string
  fantasia: string
  regime: string
}

const INITIAL_FORM: CompanyFormData = {
  cnpj: '',
  name: '',
  fantasia: '',
  regime: '',
}

export default function CompaniesPage() {
  const [search, setSearch] = useState('')
  const [showDialog, setShowDialog] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<CompanyFormData>(INITIAL_FORM)

  const { data: companies = [], isLoading } = useCompanies(search)
  const createMutation = useCreateCompany()
  const updateMutation = useUpdateCompany()
  const deleteMutation = useDeleteCompany()

  function openCreate() {
    setForm(INITIAL_FORM)
    setEditingId(null)
    setShowDialog(true)
  }

  function openEdit(company: { id: string; cnpj: string; name: string; fantasia?: string | null; regime?: string | null }) {
    setForm({
      cnpj: company.cnpj,
      name: company.name,
      fantasia: company.fantasia || '',
      regime: company.regime || '',
    })
    setEditingId(company.id)
    setShowDialog(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    try {
      if (editingId) {
        await updateMutation.mutateAsync({
          id: editingId,
          name: form.name,
          fantasia: form.fantasia || undefined,
          regime: form.regime || undefined,
        })
        toast.success('Empresa atualizada', form.name)
      } else {
        await createMutation.mutateAsync({
          cnpj: form.cnpj.replace(/\D/g, ''),
          name: form.name,
          fantasia: form.fantasia || undefined,
          regime: (form.regime as 'SIMPLES' | 'LUCRO_PRESUMIDO' | 'LUCRO_REAL') || undefined,
        })
        toast.success('Empresa criada', form.name)
      }
      setShowDialog(false)
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } }
      toast.error('Erro', error.response?.data?.error || 'Tente novamente')
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Desativar empresa "${name}"?`)) return
    try {
      await deleteMutation.mutateAsync(id)
      toast.success('Empresa desativada', name)
    } catch {
      toast.error('Erro ao desativar empresa')
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Empresas</h1>
          <p className="text-sm text-gray-500 mt-0.5">{companies.length} empresa(s) cadastrada(s)</p>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" />
          Nova Empresa
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          type="text"
          placeholder="Buscar por nome ou CNPJ..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-9 w-full pl-9 pr-3 rounded-md border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Empresa</TableHead>
                <TableHead>CNPJ</TableHead>
                <TableHead>Regime</TableHead>
                <TableHead className="text-right">NF-e</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Cadastrado em</TableHead>
                <TableHead className="w-20"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 7 }).map((_, j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                : companies.length === 0
                  ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-12">
                        <div className="flex flex-col items-center gap-3 text-gray-400">
                          <Building2 className="h-10 w-10 text-gray-200" />
                          <p>Nenhuma empresa encontrada</p>
                          <Button variant="outline" size="sm" onClick={openCreate}>
                            Cadastrar empresa
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                  : companies.map((company) => (
                    <TableRow key={company.id}>
                      <TableCell>
                        <p className="font-medium text-gray-900">{company.name}</p>
                        {company.fantasia && (
                          <p className="text-xs text-gray-400">{company.fantasia}</p>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-sm">{formatCNPJ(company.cnpj)}</TableCell>
                      <TableCell>
                        {company.regime ? (
                          <span className="text-xs px-2 py-1 rounded-full bg-blue-50 text-blue-700 font-medium">
                            {company.regime.replace('_', ' ')}
                          </span>
                        ) : (
                          <span className="text-gray-400 text-xs">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {company._count.nfes.toLocaleString('pt-BR')}
                      </TableCell>
                      <TableCell>
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${company.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                          {company.active ? 'Ativa' : 'Inativa'}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-gray-500">
                        {formatDateTime(company.createdAt)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => openEdit(company)}
                          >
                            <Edit2 className="h-3.5 w-3.5 text-gray-500" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => handleDelete(company.id, company.name)}
                            disabled={!company.active}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-red-400" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className={editingId ? 'max-w-lg' : 'max-w-md'}>
          <DialogHeader>
            <DialogTitle>{editingId ? 'Editar Empresa' : 'Nova Empresa'}</DialogTitle>
          </DialogHeader>

          {editingId ? (
            <Tabs defaultValue="dados">
              <TabsList>
                <TabsTrigger value="dados">Dados</TabsTrigger>
                <TabsTrigger value="certificado">Certificado Digital</TabsTrigger>
              </TabsList>
              <TabsContent value="dados">
                <CompanyForm
                  form={form}
                  setForm={setForm}
                  editingId={editingId}
                  onSubmit={handleSubmit}
                  onCancel={() => setShowDialog(false)}
                  isPending={createMutation.isPending || updateMutation.isPending}
                />
              </TabsContent>
              <TabsContent value="certificado">
                <CertificateTab companyId={editingId} />
              </TabsContent>
            </Tabs>
          ) : (
            <CompanyForm
              form={form}
              setForm={setForm}
              editingId={editingId}
              onSubmit={handleSubmit}
              onCancel={() => setShowDialog(false)}
              isPending={createMutation.isPending || updateMutation.isPending}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

interface CompanyFormProps {
  form: CompanyFormData
  setForm: (form: CompanyFormData) => void
  editingId: string | null
  onSubmit: (e: React.FormEvent) => void
  onCancel: () => void
  isPending: boolean
}

function CompanyForm({ form, setForm, editingId, onSubmit, onCancel, isPending }: CompanyFormProps) {
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Input
        label="CNPJ *"
        placeholder="00.000.000/0001-00"
        value={form.cnpj}
        onChange={(e) => setForm({ ...form, cnpj: e.target.value })}
        disabled={!!editingId}
        required
      />
      <Input
        label="Razão Social *"
        placeholder="Nome da empresa"
        value={form.name}
        onChange={(e) => setForm({ ...form, name: e.target.value })}
        required
      />
      <Input
        label="Nome Fantasia"
        placeholder="Nome comercial (opcional)"
        value={form.fantasia}
        onChange={(e) => setForm({ ...form, fantasia: e.target.value })}
      />
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-gray-700">Regime Tributário</label>
        <Select value={form.regime} onValueChange={(v) => setForm({ ...form, regime: v })}>
          <SelectTrigger>
            <SelectValue placeholder="Selecione o regime..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="SIMPLES">Simples Nacional</SelectItem>
            <SelectItem value="LUCRO_PRESUMIDO">Lucro Presumido</SelectItem>
            <SelectItem value="LUCRO_REAL">Lucro Real</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <DialogFooter className="pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" disabled={isPending}>
          {editingId ? 'Salvar' : 'Cadastrar'}
        </Button>
      </DialogFooter>
    </form>
  )
}
