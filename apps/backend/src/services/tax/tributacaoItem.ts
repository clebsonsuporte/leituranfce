// Fonte única da classificação de ICMS e PIS/COFINS de um item para a
// Segregação do PGDAS-D (LC 123/2006, art. 18, § 4º-A; Resolução CGSN 140/2018, art. 25).
import { classificarCstPisCofins, classificarNcmPisCofins, PREFIXOS_NCM_MONOFASICO } from './pisCofinsClassifier.js'

export type TribPis = 'Tributado' | 'Tributação Monofásica' | 'Substituição Tributária' | 'Isento/NT'
export type TribIcms = 'Tributado' | 'Simples Nacional' | 'Substituição Tributária' | 'Substituto Tributário' | 'Isento/NT'
export type AvisoPis = 'reclassificado_ncm' | 'cst_sem_base' | 'possivel_monofasico' | null

// Só o substituído (imposto já retido) exclui o ICMS do DAS; o substituto recolhe
// o ICMS próprio dentro do Simples (Res. CGSN 140/2018, art. 25, § 8º, I e II).
const CSOSN_SUBSTITUIDO = ['500']
const CST_SUBSTITUIDO = ['60', '61']
const CSOSN_SUBSTITUTO = ['201', '202', '203']
const CST_SUBSTITUTO = ['10', '30', '70']
const CSOSN_SIMPLES = ['101', '102', '103', '300', '400', '900']
const CST_ISENTO = ['40', '41', '50']

export function derivarTribIcms(cstIcms: string | null | undefined, csosn: string | null | undefined): TribIcms {
  if (csosn && CSOSN_SUBSTITUIDO.includes(csosn)) return 'Substituição Tributária'
  if (cstIcms && CST_SUBSTITUIDO.includes(cstIcms)) return 'Substituição Tributária'
  if (csosn && CSOSN_SUBSTITUTO.includes(csosn)) return 'Substituto Tributário'
  if (cstIcms && CST_SUBSTITUTO.includes(cstIcms)) return 'Substituto Tributário'
  if (csosn && CSOSN_SIMPLES.includes(csosn)) return 'Simples Nacional'
  if (cstIcms && CST_ISENTO.includes(cstIcms)) return 'Isento/NT'
  return 'Tributado'
}

// O regime vem da lei (NCM); o CST da nota só decide quando o NCM não resolve.
export function derivarTribPis(
  ncm: string | null | undefined,
  cstPis: string | null | undefined,
  cstCofins?: string | null,
): { tribPis: TribPis; aviso: AvisoPis } {
  const lei = classificarNcmPisCofins(ncm)
  const declarado = classificarCstPisCofins(cstPis || cstCofins)

  if (lei.regime === 'st') {
    return { tribPis: 'Substituição Tributária', aviso: declarado === 'st' ? null : 'reclassificado_ncm' }
  }
  if (lei.regime === 'monofasico' && !lei.verificar) {
    return { tribPis: 'Tributação Monofásica', aviso: declarado === 'monofasico' ? null : 'reclassificado_ncm' }
  }
  if (declarado === 'monofasico') {
    return { tribPis: 'Tributação Monofásica', aviso: lei.regime === 'monofasico' ? null : 'cst_sem_base' }
  }
  if (declarado === 'st') return { tribPis: 'Substituição Tributária', aviso: 'cst_sem_base' }
  if (lei.regime === 'monofasico') return { tribPis: 'Tributado', aviso: 'possivel_monofasico' }
  // Alíquota zero, isenção e suspensão não reduzem o DAS do Simples (LC 123/2006, art. 24, § 1º).
  if (declarado === 'desonerado') return { tribPis: 'Isento/NT', aviso: null }
  return { tribPis: 'Tributado', aviso: null }
}

// Pré-filtro de banco para os relatórios de monofásico; o resultado ainda passa por isItemMonofasico.
export const FILTRO_PRISMA_MONOFASICO = [
  { cstPis: '04' },
  { cstCofins: '04' },
  ...PREFIXOS_NCM_MONOFASICO.map(prefixo => ({ ncm: { startsWith: prefixo } })),
]

export function isItemMonofasico(item: { ncm: string | null; cstPis: string | null; cstCofins: string | null }): boolean {
  return derivarTribPis(item.ncm, item.cstPis, item.cstCofins).tribPis === 'Tributação Monofásica'
}
