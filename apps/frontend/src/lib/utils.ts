import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

export function formatCurrency(value: number | string | null | undefined): string {
  const n = Number(value ?? 0)
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function formatNumber(value: number | string | null | undefined, decimals = 2): string {
  const n = Number(value ?? 0)
  return n.toLocaleString('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

export function formatCNPJ(cnpj: string | null | undefined): string {
  if (!cnpj) return ''
  const clean = cnpj.replace(/\D/g, '')
  if (clean.length !== 14) return cnpj
  return clean.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
}

export function formatCPF(cpf: string | null | undefined): string {
  if (!cpf) return ''
  const clean = cpf.replace(/\D/g, '')
  if (clean.length !== 11) return cpf
  return clean.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
}

export function formatChNFe(chNFe: string | null | undefined): string {
  if (!chNFe) return ''
  return chNFe.replace(/(\d{4})/g, '$1 ').trim()
}

export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return ''
  try {
    const d = typeof date === 'string' ? parseISO(date) : date
    return format(d, 'dd/MM/yyyy', { locale: ptBR })
  } catch {
    return String(date)
  }
}

export function formatDateTime(date: string | Date | null | undefined): string {
  if (!date) return ''
  try {
    const d = typeof date === 'string' ? parseISO(date) : date
    return format(d, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
  } catch {
    return String(date)
  }
}

export function formatCompetencia(competencia: string | null | undefined): string {
  if (!competencia) return ''
  const [year, month] = competencia.split('-')
  if (!year || !month) return competencia
  const months = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
  ]
  const monthIndex = parseInt(month, 10) - 1
  return `${months[monthIndex]}/${year}`
}

export function currentCompetencia(): string {
  return format(new Date(), 'yyyy-MM')
}

export function competenciaOptions(count = 24): Array<{ value: string; label: string }> {
  const options = []
  for (let i = 0; i < count; i++) {
    const date = new Date()
    date.setMonth(date.getMonth() - i)
    const value = format(date, 'yyyy-MM')
    const label = formatCompetencia(value)
    options.push({ value, label })
  }
  return options
}

export function getStatusColor(status: string): string {
  switch (status) {
    case 'AUTORIZADA': return 'text-green-700 bg-green-100'
    case 'CANCELADA': return 'text-red-700 bg-red-100'
    case 'DENEGADA': return 'text-orange-700 bg-orange-100'
    case 'INUTILIZADA': return 'text-gray-700 bg-gray-100'
    default: return 'text-gray-700 bg-gray-100'
  }
}

export function getStatusLabel(status: string): string {
  switch (status) {
    case 'AUTORIZADA': return 'Autorizada'
    case 'CANCELADA': return 'Cancelada'
    case 'DENEGADA': return 'Denegada'
    case 'INUTILIZADA': return 'Inutilizada'
    default: return status
  }
}

export function getSeverityColor(severity: string): string {
  switch (severity) {
    case 'CRITICAL': return 'text-red-700 bg-red-100 border-red-200'
    case 'ERROR': return 'text-red-600 bg-red-50 border-red-100'
    case 'WARNING': return 'text-orange-600 bg-orange-50 border-orange-100'
    case 'INFO': return 'text-blue-600 bg-blue-50 border-blue-100'
    default: return 'text-gray-600 bg-gray-50 border-gray-100'
  }
}

export function abbreviateNumber(n: number): string {
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + 'B'
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return n.toString()
}
