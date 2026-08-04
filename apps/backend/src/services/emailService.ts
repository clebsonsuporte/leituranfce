import nodemailer, { Transporter } from 'nodemailer'
import AdmZip from 'adm-zip'
import prisma from '../lib/prisma.js'
import { generateEntradasSaidasReport } from './reports/itemsReportService.js'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtCompetencia(c: string): string {
  const [y, m] = c.split('-')
  return `${m}/${y}`
}

// ─── Criar transporter a partir das configurações salvas ────────────────────

async function createTransporter(): Promise<Transporter> {
  const cfg = await prisma.emailSettings.findFirst()
  if (!cfg) throw new Error('Configurações de e-mail não encontradas. Configure o servidor SMTP primeiro.')

  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.password },
    tls: { rejectUnauthorized: false },
  })
}

// ─── Testar conexão SMTP ─────────────────────────────────────────────────────

export async function testSmtpConnection(settings: {
  host: string; port: number; secure: boolean; user: string; password: string
}): Promise<{ ok: boolean; message: string }> {
  try {
    const transporter = nodemailer.createTransport({
      host: settings.host,
      port: settings.port,
      secure: settings.secure,
      auth: { user: settings.user, pass: settings.password },
      tls: { rejectUnauthorized: false },
    })
    await transporter.verify()
    return { ok: true, message: 'Conexão estabelecida com sucesso!' }
  } catch (err: unknown) {
    const e = err as Error
    return { ok: false, message: e.message || 'Erro ao conectar' }
  }
}

// ─── Gerar ZIP dos XMLs de uma competência ──────────────────────────────────

export async function buildXmlZip(companyId: string, competencia: string): Promise<Buffer> {
  const nfes = await prisma.nfe.findMany({
    where: { companyId, competencia },
    select: { chNFe: true, nNF: true, serie: true, xmlRaw: true, mod: true },
    orderBy: [{ serie: 'asc' }, { nNF: 'asc' }],
  })

  if (nfes.length === 0) throw new Error(`Nenhuma NF-e encontrada para a competência ${fmtCompetencia(competencia)}`)

  const zip = new AdmZip()
  for (const nfe of nfes) {
    const modStr = nfe.mod === 65 ? 'NFC-e' : 'NF-e'
    const filename = `${modStr}_${nfe.serie}_${nfe.nNF}_${nfe.chNFe}.xml`
    zip.addFile(filename, Buffer.from(nfe.xmlRaw, 'utf-8'))
  }
  return zip.toBuffer()
}

// ─── Enviar e-mail com anexos ────────────────────────────────────────────────

export interface SendEmailOptions {
  companyId: string
  competencia: string
  recipients: string[]        // lista de emails destino
  extraMessage?: string
}

export async function sendFechamentoEmail(opts: SendEmailOptions): Promise<{ sent: number }> {
  const { companyId, competencia, recipients, extraMessage } = opts

  if (recipients.length === 0) throw new Error('Nenhum destinatário informado')

  const company = await prisma.company.findUnique({ where: { id: companyId } })
  if (!company) throw new Error('Empresa não encontrada')

  const settings = await prisma.emailSettings.findFirst()
  if (!settings) throw new Error('Configurações de e-mail não encontradas')

  const competenciaLabel = fmtCompetencia(competencia)
  const subject = `Fechamento - ${company.name} - ${competenciaLabel}`

  // Gerar anexos em paralelo
  const [zipBuffer, pdfBuffer] = await Promise.all([
    buildXmlZip(companyId, competencia),
    generateEntradasSaidasReport({ companyId, competencia }),
  ])

  const [compMonth, compYear] = [competencia.split('-')[1], competencia.split('-')[0]]
  const zipFilename = `XMLs_${company.name.replace(/[^a-zA-Z0-9]/g, '_')}_${compMonth}-${compYear}.zip`
  const pdfFilename = `Relatorio_Saidas_${company.name.replace(/[^a-zA-Z0-9]/g, '_')}_${compMonth}-${compYear}.pdf`

  const generatedAt = format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })

  const htmlBody = `
    <div style="font-family:Arial,sans-serif;font-size:14px;color:#1f2937;max-width:600px">
      <div style="background:#1e40af;padding:20px 24px;border-radius:8px 8px 0 0">
        <h2 style="color:white;margin:0;font-size:18px">📊 Fechamento Fiscal</h2>
        <p style="color:#93c5fd;margin:4px 0 0;font-size:13px">${subject}</p>
      </div>
      <div style="background:#f9fafb;border:1px solid #e5e7eb;border-top:none;padding:24px;border-radius:0 0 8px 8px">
        <p>Olá,</p>
        <p>Segue em anexo o fechamento fiscal de <strong>${competenciaLabel}</strong> para a empresa <strong>${company.name}</strong>.</p>

        <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:13px">
          <tr style="background:#e0e7ff">
            <td style="padding:8px 12px;font-weight:bold;border:1px solid #c7d2fe">Empresa</td>
            <td style="padding:8px 12px;border:1px solid #c7d2fe">${company.name}</td>
          </tr>
          <tr>
            <td style="padding:8px 12px;font-weight:bold;border:1px solid #c7d2fe">Competência</td>
            <td style="padding:8px 12px;border:1px solid #c7d2fe">${competenciaLabel}</td>
          </tr>
          <tr style="background:#e0e7ff">
            <td style="padding:8px 12px;font-weight:bold;border:1px solid #c7d2fe">Gerado em</td>
            <td style="padding:8px 12px;border:1px solid #c7d2fe">${generatedAt}</td>
          </tr>
        </table>

        <p style="font-weight:bold;margin-top:16px">📎 Anexos:</p>
        <ul style="font-size:13px;color:#374151">
          <li><strong>${zipFilename}</strong> — Arquivo ZIP com todos os XMLs das NF-e/NFC-e do período</li>
          <li><strong>${pdfFilename}</strong> — Relatório de saídas em PDF</li>
        </ul>

        ${extraMessage ? `<div style="background:#fffbeb;border:1px solid #fcd34d;border-radius:6px;padding:12px;margin-top:16px;font-size:13px">${extraMessage}</div>` : ''}

        <p style="margin-top:24px;color:#6b7280;font-size:12px;border-top:1px solid #e5e7eb;padding-top:12px">
          Enviado automaticamente pelo <strong>Fiscal Dashboard</strong><br>
          ${generatedAt}
        </p>
      </div>
    </div>
  `

  const transporter = await createTransporter()

  await transporter.sendMail({
    from: `"${settings.fromName}" <${settings.fromEmail}>`,
    to: recipients.join(', '),
    subject,
    html: htmlBody,
    attachments: [
      { filename: zipFilename, content: zipBuffer, contentType: 'application/zip' },
      { filename: pdfFilename, content: pdfBuffer, contentType: 'application/pdf' },
    ],
  })

  return { sent: recipients.length }
}
