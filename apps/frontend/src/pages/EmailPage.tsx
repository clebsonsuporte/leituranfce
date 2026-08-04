import { useState, useEffect } from 'react'
import {
  Mail, Settings, Send, Plus, Trash2, Loader2, CheckCircle2, XCircle,
  Building2, ChevronDown, Eye, EyeOff, RefreshCw, Paperclip,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from '@/components/ui/toast'
import { useCompanies } from '@/hooks/useCompanies'
import { formatCNPJ, formatCompetencia, competenciaOptions } from '@/lib/utils'
import api from '@/lib/api'

// ─── Types ────────────────────────────────────────────────────────────────────

interface SmtpSettings {
  id?: string
  host: string
  port: number
  secure: boolean
  user: string
  password: string
  fromName: string
  fromEmail: string
}

interface CompanyEmail {
  id: string
  companyId: string
  email: string
  name: string | null
  createdAt: string
}

// ─── Default SMTP (KingHost) ──────────────────────────────────────────────────

const DEFAULT_SMTP: SmtpSettings = {
  host: 'smtp.kinghost.net',
  port: 587,
  secure: false,
  user: '',
  password: '',
  fromName: 'Fiscal Dashboard',
  fromEmail: '',
}

// ─── Component ────────────────────────────────────────────────────────────────

type Tab = 'send' | 'smtp'

export default function EmailPage() {
  const [tab, setTab] = useState<Tab>('send')
  const { data: companies = [] } = useCompanies()
  const competOpts = competenciaOptions(24)

  // ── Aba Enviar ──────────────────────────────────────────────────────────────
  const [selectedCompanyId, setSelectedCompanyId] = useState('')
  const [competencia, setCompetencia] = useState('')
  const [contacts, setContacts] = useState<CompanyEmail[]>([])
  const [loadingContacts, setLoadingContacts] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [newName, setNewName] = useState('')
  const [addingContact, setAddingContact] = useState(false)
  const [extraMessage, setExtraMessage] = useState('')
  const [sending, setSending] = useState(false)

  // ── Aba SMTP ────────────────────────────────────────────────────────────────
  const [smtp, setSmtp] = useState<SmtpSettings>(DEFAULT_SMTP)
  const [showPassword, setShowPassword] = useState(false)
  const [savingSmtp, setSavingSmtp] = useState(false)
  const [testingSmtp, setTestingSmtp] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)

  // Carregar settings SMTP ao montar
  useEffect(() => {
    api.get('/email/settings').then(res => {
      if (res.data) setSmtp(s => ({ ...s, ...res.data }))
    }).catch(() => {})
  }, [])

  // Carregar contatos quando empresa mudar
  useEffect(() => {
    if (!selectedCompanyId) { setContacts([]); return }
    setLoadingContacts(true)
    api.get(`/email/companies/${selectedCompanyId}/contacts`)
      .then(res => setContacts(res.data))
      .catch(() => toast.error('Erro', 'Falha ao carregar contatos'))
      .finally(() => setLoadingContacts(false))
  }, [selectedCompanyId])

  const selectedCompany = companies.find(c => c.id === selectedCompanyId)

  // Assunto automático
  const subject = selectedCompany && competencia
    ? `Fechamento - ${selectedCompany.name} - ${formatCompetencia(competencia)}`
    : selectedCompany
      ? `Fechamento - ${selectedCompany.name}`
      : 'Fechamento'

  // ── Handlers ────────────────────────────────────────────────────────────────

  async function handleAddContact() {
    if (!selectedCompanyId) return
    const email = newEmail.trim().toLowerCase()
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error('E-mail inválido', 'Verifique o endereço digitado')
      return
    }
    setAddingContact(true)
    try {
      const res = await api.post(`/email/companies/${selectedCompanyId}/contacts`, {
        email, name: newName.trim() || undefined,
      })
      setContacts(prev => [...prev, res.data])
      setNewEmail('')
      setNewName('')
      toast.success('Contato adicionado!', email)
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } }
      toast.error('Erro', e.response?.data?.error || 'Falha ao adicionar contato')
    } finally {
      setAddingContact(false)
    }
  }

  async function handleRemoveContact(id: string, email: string) {
    if (!selectedCompanyId) return
    try {
      await api.delete(`/email/companies/${selectedCompanyId}/contacts/${id}`)
      setContacts(prev => prev.filter(c => c.id !== id))
      toast.success('Removido', email)
    } catch {
      toast.error('Erro', 'Falha ao remover contato')
    }
  }

  async function handleSend() {
    if (!selectedCompanyId) { toast.error('Selecione uma empresa', ''); return }
    if (!competencia) { toast.error('Selecione a competência', ''); return }
    if (contacts.length === 0) { toast.error('Nenhum destinatário cadastrado', 'Adicione ao menos um e-mail para esta empresa'); return }

    setSending(true)
    try {
      await api.post('/email/send', {
        companyId: selectedCompanyId,
        competencia,
        recipients: contacts.map(c => c.email),
        extraMessage: extraMessage.trim() || undefined,
      })
      toast.success('E-mail enviado!', `${contacts.length} destinatário(s) notificado(s)`)
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } }
      toast.error('Erro ao enviar', e.response?.data?.error || 'Verifique as configurações SMTP')
    } finally {
      setSending(false)
    }
  }

  async function handleSaveSmtp() {
    setSavingSmtp(true)
    try {
      await api.put('/email/settings', smtp)
      toast.success('Configurações salvas!', 'Servidor SMTP atualizado')
      setTestResult(null)
    } catch {
      toast.error('Erro', 'Falha ao salvar configurações')
    } finally {
      setSavingSmtp(false)
    }
  }

  async function handleTestSmtp() {
    setTestingSmtp(true)
    setTestResult(null)
    try {
      const res = await api.post('/email/test', {
        host: smtp.host, port: smtp.port, secure: smtp.secure,
        user: smtp.user, password: smtp.password,
      })
      setTestResult(res.data)
    } catch {
      setTestResult({ ok: false, message: 'Erro ao testar conexão' })
    } finally {
      setTestingSmtp(false)
    }
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div>
        <h1 className="text-xl font-bold text-gray-900">E-mail Fiscal</h1>
        <p className="text-sm text-gray-500 mt-0.5">Envio automático do fechamento mensal com XMLs e relatório</p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        <button
          onClick={() => setTab('send')}
          className={`flex items-center gap-2 px-5 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
            tab === 'send' ? 'border-primary-600 text-primary-700' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Send className="h-4 w-4" /> Enviar Fechamento
        </button>
        <button
          onClick={() => setTab('smtp')}
          className={`flex items-center gap-2 px-5 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
            tab === 'smtp' ? 'border-primary-600 text-primary-700' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Settings className="h-4 w-4" /> Configurações SMTP
        </button>
      </div>

      {/* ── Aba: Enviar ─────────────────────────────────────────────────────── */}
      {tab === 'send' && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-2 space-y-5">

            {/* Empresa + Competência */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Selecione a Empresa e Competência</CardTitle>
              </CardHeader>
              <CardContent className="pt-0 grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1">Empresa</label>
                  <Select value={selectedCompanyId} onValueChange={setSelectedCompanyId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      {companies.map(c => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                          {c.cnpj && <span className="text-gray-400 ml-2 text-xs">{formatCNPJ(c.cnpj)}</span>}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1">Competência</label>
                  <Select value={competencia} onValueChange={setCompetencia}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      {competOpts.map(o => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* Destinatários */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Mail className="h-4 w-4 text-primary-600" />
                  Destinatários
                  {selectedCompany && (
                    <span className="text-xs text-gray-400 font-normal">— {selectedCompany.name}</span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 space-y-4">
                {!selectedCompanyId ? (
                  <p className="text-sm text-gray-400 py-4 text-center">Selecione uma empresa para ver/editar os destinatários</p>
                ) : loadingContacts ? (
                  <div className="flex justify-center py-4">
                    <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                  </div>
                ) : (
                  <>
                    {/* Lista de contatos */}
                    {contacts.length === 0 ? (
                      <p className="text-sm text-gray-400 text-center py-2">Nenhum destinatário cadastrado para esta empresa</p>
                    ) : (
                      <div className="divide-y divide-gray-100">
                        {contacts.map(c => (
                          <div key={c.id} className="flex items-center justify-between py-2.5 gap-3">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="h-7 w-7 rounded-full bg-primary-100 flex items-center justify-center shrink-0">
                                <Mail className="h-3.5 w-3.5 text-primary-700" />
                              </div>
                              <div className="min-w-0">
                                {c.name && <p className="text-sm font-medium text-gray-800 truncate">{c.name}</p>}
                                <p className="text-sm text-gray-500 truncate">{c.email}</p>
                              </div>
                            </div>
                            <button
                              onClick={() => handleRemoveContact(c.id, c.email)}
                              className="p-1.5 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors shrink-0"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Adicionar novo contato */}
                    <div className="border-t border-gray-100 pt-3">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Adicionar destinatário</p>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="Nome (opcional)"
                          value={newName}
                          onChange={e => setNewName(e.target.value)}
                          className="flex-1 h-9 px-3 rounded-md border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                        />
                        <input
                          type="email"
                          placeholder="email@exemplo.com.br"
                          value={newEmail}
                          onChange={e => setNewEmail(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && handleAddContact()}
                          className="flex-[2] h-9 px-3 rounded-md border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                        />
                        <Button size="sm" onClick={handleAddContact} disabled={addingContact || !newEmail}>
                          {addingContact ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                        </Button>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Mensagem extra (opcional) */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Mensagem Adicional <span className="text-gray-400 font-normal">(opcional)</span></CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <textarea
                  rows={3}
                  placeholder="Observações ou recados para incluir no corpo do e-mail..."
                  value={extraMessage}
                  onChange={e => setExtraMessage(e.target.value)}
                  className="w-full px-3 py-2 rounded-md border border-gray-200 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </CardContent>
            </Card>
          </div>

          {/* Painel resumo */}
          <div>
            <Card className="sticky top-20">
              <CardHeader>
                <CardTitle>Resumo do Envio</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Assunto */}
                <div className="bg-primary-50 border border-primary-200 rounded-lg p-3">
                  <p className="text-xs text-primary-600 font-semibold mb-1">ASSUNTO</p>
                  <p className="text-sm font-medium text-primary-900">{subject}</p>
                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Empresa:</span>
                    <span className="font-medium truncate max-w-[140px]">{selectedCompany?.name || '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Competência:</span>
                    <span className="font-medium">{competencia ? formatCompetencia(competencia) : '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Destinatários:</span>
                    <span className="font-medium">{contacts.length}</span>
                  </div>
                </div>

                {/* Anexos */}
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-1.5">
                  <p className="text-xs font-semibold text-gray-600 flex items-center gap-1.5">
                    <Paperclip className="h-3.5 w-3.5" /> ANEXOS
                  </p>
                  <p className="text-xs text-gray-500">📦 XMLs_{selectedCompany?.name?.replace(/\s/g, '_') || 'Empresa'}.zip</p>
                  <p className="text-xs text-gray-500">📄 Relatorio_Saidas.pdf</p>
                </div>

                <div className="pt-3 border-t border-gray-100">
                  <Button
                    onClick={handleSend}
                    disabled={sending || !selectedCompanyId || !competencia || contacts.length === 0}
                    className="w-full gap-2"
                  >
                    {sending ? (
                      <><Loader2 className="h-4 w-4 animate-spin" />Enviando...</>
                    ) : (
                      <><Send className="h-4 w-4" />Enviar Fechamento</>
                    )}
                  </Button>
                </div>

                {contacts.length === 0 && selectedCompanyId && (
                  <p className="text-xs text-amber-600 text-center bg-amber-50 rounded p-2">
                    Adicione ao menos um destinatário
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* ── Aba: SMTP ───────────────────────────────────────────────────────── */}
      {tab === 'smtp' && (
        <div className="max-w-2xl space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5 text-primary-600" />
                Servidor de Saída (SMTP)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Preset KingHost */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-blue-800">KingHost</p>
                  <p className="text-xs text-blue-600">smtp.kinghost.net · Porta 587 · STARTTLS</p>
                </div>
                <button
                  onClick={() => setSmtp(s => ({ ...s, host: 'smtp.kinghost.net', port: 587, secure: false }))}
                  className="text-xs font-semibold text-blue-700 hover:text-blue-900 border border-blue-300 rounded px-2 py-1 hover:bg-blue-100 transition-colors"
                >
                  Aplicar
                </button>
              </div>

              {/* Campos */}
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="text-sm font-medium text-gray-700 block mb-1">Servidor SMTP (Host)</label>
                  <input
                    type="text"
                    value={smtp.host}
                    onChange={e => setSmtp(s => ({ ...s, host: e.target.value }))}
                    placeholder="smtp.kinghost.net"
                    className="w-full h-9 px-3 rounded-md border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1">Porta</label>
                  <input
                    type="number"
                    value={smtp.port}
                    onChange={e => setSmtp(s => ({ ...s, port: parseInt(e.target.value) || 587 }))}
                    className="w-full h-9 px-3 rounded-md border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1">Segurança</label>
                  <select
                    value={smtp.secure ? 'ssl' : 'tls'}
                    onChange={e => setSmtp(s => ({ ...s, secure: e.target.value === 'ssl', port: e.target.value === 'ssl' ? 465 : 587 }))}
                    className="w-full h-9 px-3 rounded-md border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
                  >
                    <option value="tls">STARTTLS (porta 587)</option>
                    <option value="ssl">SSL/TLS (porta 465)</option>
                  </select>
                </div>

                <div className="col-span-2">
                  <label className="text-sm font-medium text-gray-700 block mb-1">Usuário (e-mail de envio)</label>
                  <input
                    type="email"
                    value={smtp.user}
                    onChange={e => setSmtp(s => ({ ...s, user: e.target.value, fromEmail: s.fromEmail || e.target.value }))}
                    placeholder="seuemail@seudominio.com.br"
                    className="w-full h-9 px-3 rounded-md border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>

                <div className="col-span-2">
                  <label className="text-sm font-medium text-gray-700 block mb-1">Senha</label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={smtp.password}
                      onChange={e => setSmtp(s => ({ ...s, password: e.target.value }))}
                      placeholder="••••••••"
                      className="w-full h-9 px-3 pr-10 rounded-md border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(v => !v)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1">Nome do Remetente</label>
                  <input
                    type="text"
                    value={smtp.fromName}
                    onChange={e => setSmtp(s => ({ ...s, fromName: e.target.value }))}
                    placeholder="Fiscal Dashboard"
                    className="w-full h-9 px-3 rounded-md border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1">E-mail Remetente</label>
                  <input
                    type="email"
                    value={smtp.fromEmail}
                    onChange={e => setSmtp(s => ({ ...s, fromEmail: e.target.value }))}
                    placeholder="seuemail@seudominio.com.br"
                    className="w-full h-9 px-3 rounded-md border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
              </div>

              {/* Resultado do teste */}
              {testResult && (
                <div className={`flex items-center gap-2.5 p-3 rounded-lg border text-sm ${
                  testResult.ok
                    ? 'bg-green-50 border-green-200 text-green-800'
                    : 'bg-red-50 border-red-200 text-red-800'
                }`}>
                  {testResult.ok
                    ? <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                    : <XCircle className="h-4 w-4 text-red-500 shrink-0" />}
                  {testResult.message}
                </div>
              )}

              {/* Botões */}
              <div className="flex gap-3 pt-2">
                <Button
                  variant="outline"
                  onClick={handleTestSmtp}
                  disabled={testingSmtp || !smtp.host || !smtp.user}
                  className="gap-2"
                >
                  {testingSmtp ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  Testar Conexão
                </Button>
                <Button
                  onClick={handleSaveSmtp}
                  disabled={savingSmtp || !smtp.host || !smtp.user}
                  className="gap-2"
                >
                  {savingSmtp ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Salvar Configurações
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Info box */}
          <Card>
            <CardContent className="pt-4">
              <p className="text-sm font-semibold text-gray-700 mb-2">ℹ️ Configurações KingHost</p>
              <div className="text-xs text-gray-500 space-y-1 font-mono">
                <p>Servidor de saída: <strong>smtp.kinghost.net</strong></p>
                <p>Porta STARTTLS: <strong>587</strong></p>
                <p>Porta SSL/TLS: <strong>465</strong></p>
                <p>Autenticação: <strong>Usuário e Senha</strong></p>
                <p>Usuário: <strong>seu e-mail completo</strong></p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
