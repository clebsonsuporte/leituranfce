// Classifica o regime de PIS/COFINS de um item pelo NCM (o que a lei manda) e
// pelo CST da nota (o que o emissor declarou), e aponta quando os dois divergem.
// As listas são por prefixo de NCM; onde a lei depende de "Ex" da TIPI o item
// sai com `verificar`, porque o XML não traz o Ex.

export type RegimePisCofins = 'normal' | 'st' | 'monofasico'
export type CstDeclarado = 'normal' | 'monofasico' | 'st' | 'desonerado' | 'generico' | 'entrada'

interface Regra {
  regime: Exclude<RegimePisCofins, 'normal'>
  grupo: string
  base: string
  prefixos: string[]
  excecoes?: string[]
  verificar?: string
}

const REGRAS: Regra[] = [
  {
    regime: 'st',
    grupo: 'Cigarros e cigarrilhas',
    base: 'Lei 9.532/1997, art. 53; Lei 12.402/2011, art. 6º',
    prefixos: ['24021000', '24022000'],
  },
  {
    regime: 'st',
    grupo: 'Motocicletas',
    base: 'MP 2.158-35/2001, art. 43',
    prefixos: ['8711'],
  },
  {
    regime: 'monofasico',
    grupo: 'Combustíveis',
    base: 'Lei 9.718/1998, arts. 4º e 5º; Lei 11.116/2005',
    prefixos: ['2710125', '2710192', '27101911', '27111910', '220710', '2207201', '38260000'],
  },
  {
    regime: 'monofasico',
    grupo: 'Medicamentos e produtos farmacêuticos',
    base: 'Lei 10.147/2000, art. 1º, I, "a"',
    prefixos: ['3001', '3003', '3004', '30051010', '300630', '30066000'],
    excecoes: ['30039056', '30049046'],
  },
  {
    regime: 'monofasico',
    grupo: 'Produtos farmacêuticos (posição 30.02)',
    base: 'Lei 10.147/2000, art. 1º, I, "a"',
    prefixos: ['3002'],
    verificar: 'Só parte da posição 30.02 é monofásica — conferir o código completo na lei.',
  },
  {
    regime: 'monofasico',
    grupo: 'Perfumaria, toucador e higiene pessoal',
    base: 'Lei 10.147/2000, art. 1º, I, "b"',
    prefixos: ['3303', '3304', '3305', '3307', '34011190', '34012010', '96032100'],
  },
  {
    regime: 'monofasico',
    grupo: 'Bebidas frias (refrigerante, cerveja)',
    base: 'Lei 13.097/2015, arts. 14 e 28',
    prefixos: ['2203', '220210', '22029100'],
  },
  {
    regime: 'monofasico',
    grupo: 'Bebidas frias (refrigerante, cerveja)',
    base: 'Lei 13.097/2015, arts. 14 e 28',
    prefixos: ['220299'],
    verificar: 'A lei exclui néctares de fruta e bebidas à base de soja ou de leite e cacau deste código — conferir o produto.',
  },
  {
    regime: 'monofasico',
    grupo: 'Máquinas e veículos',
    base: 'Lei 10.485/2002, art. 1º',
    prefixos: [
      '7309', '731029', '76129012', '842481', '8429', '84306990', '8432', '8433', '8434', '8435',
      '8436', '8437', '8701', '8702', '8703', '8704', '8705', '8706', '87162000',
    ],
  },
  {
    regime: 'monofasico',
    grupo: 'Autopeças',
    base: 'Lei 10.485/2002, art. 3º e Anexos I e II',
    prefixos: [
      '40161010', '6813', '70071100', '70072100', '70091000', '83012000', '83023000', '84073390',
      '84073490', '840820', '840991', '840999', '841330', '84148021', '84148022', '841520',
      '84212300', '84213100', '84314100', '84314200', '84339090', '848310', '84832000', '848330',
      '848340', '848350', '850520', '8511', '851220', '85123000', '851240', '85129000', '85272',
      '853910', '85443000', '8707', '8708', '90292010', '90299010', '90303921', '90318040',
      '9032892', '91040000', '94012000',
    ],
  },
  {
    regime: 'monofasico',
    grupo: 'Autopeças',
    base: 'Lei 10.485/2002, art. 3º e Anexos I e II',
    prefixos: ['40169990', '73201000', '841391', '84818099', '850710', '85365090'],
    verificar: 'Monofásico só para os "Ex" de uso automotivo deste código — conferir o produto.',
  },
  {
    regime: 'monofasico',
    grupo: 'Pneus e câmaras de ar',
    base: 'Lei 10.485/2002, art. 5º',
    prefixos: ['4011', '4013'],
  },
]

export const PREFIXOS_NCM_MONOFASICO = REGRAS.filter(r => r.regime === 'monofasico').flatMap(r => r.prefixos)

export interface ClassificacaoNcm {
  regime: RegimePisCofins
  grupo: string | null
  base: string | null
  verificar: string | null
  ncmValido: boolean
}

export function classificarNcmPisCofins(ncm: string | null | undefined): ClassificacaoNcm {
  const codigo = (ncm ?? '').replace(/\D/g, '')
  const normal: ClassificacaoNcm = { regime: 'normal', grupo: null, base: null, verificar: null, ncmValido: codigo.length === 8 }
  if (codigo.length !== 8) return normal

  let melhor: { regra: Regra; tamanho: number } | null = null
  for (const regra of REGRAS) {
    if (regra.excecoes?.includes(codigo)) continue
    for (const prefixo of regra.prefixos) {
      if (codigo.startsWith(prefixo) && (!melhor || prefixo.length > melhor.tamanho)) {
        melhor = { regra, tamanho: prefixo.length }
      }
    }
  }
  if (!melhor) return normal
  const { regra } = melhor
  return { regime: regra.regime, grupo: regra.grupo, base: regra.base, verificar: regra.verificar ?? null, ncmValido: true }
}

export function classificarCstPisCofins(cst: string | null | undefined): CstDeclarado {
  const c = (cst ?? '').trim()
  if (['01', '02', '03'].includes(c)) return 'normal'
  if (c === '04') return 'monofasico'
  if (c === '05') return 'st'
  if (['06', '07', '08', '09'].includes(c)) return 'desonerado'
  if (c === '' || c === '49' || c === '99') return 'generico'
  return 'entrada'
}

export interface DivergenciaPisCofins {
  tipo: 'monofasico_tributado' | 'monofasico_sem_cst' | 'st_nao_declarada' | 'cst_monofasico_sem_base' | 'cst_st_sem_base'
  severidade: 'alta' | 'media'
  mensagem: string
}

export function isCfopSaida(cfop: string): boolean {
  return ['5', '6', '7'].includes(cfop?.[0] ?? '')
}

// Só faz sentido em saídas: nas entradas o CST (50–98) fala de crédito, não do regime do produto.
export function divergenciaPisCofins(
  lei: ClassificacaoNcm,
  cst: string | null | undefined,
  cfop: string,
): DivergenciaPisCofins | null {
  if (!isCfopSaida(cfop)) return null
  const declarado = classificarCstPisCofins(cst)
  const cstLabel = cst ? `CST ${cst}` : 'sem CST de PIS/COFINS'

  if (lei.regime === 'monofasico') {
    if (declarado === 'monofasico') return null
    if (lei.verificar) {
      return {
        tipo: declarado === 'normal' ? 'monofasico_tributado' : 'monofasico_sem_cst',
        severidade: 'media',
        mensagem: `NCM com possível tributação monofásica (${lei.grupo}), mas a nota saiu com ${cstLabel}. Confirmar o enquadramento; se for monofásico, usar CST 04.`,
      }
    }
    if (declarado === 'normal') {
      return {
        tipo: 'monofasico_tributado',
        severidade: 'alta',
        mensagem: `Produto monofásico por lei (${lei.grupo}) saiu como tributado normal (${cstLabel}) — PIS/COFINS pode estar sendo pago de novo. Correto: CST 04.`,
      }
    }
    return {
      tipo: 'monofasico_sem_cst',
      severidade: 'media',
      mensagem: `Produto monofásico por lei (${lei.grupo}), mas a nota saiu com ${cstLabel}. Usar CST 04 e segregar a receita na apuração.`,
    }
  }

  if (lei.regime === 'st') {
    if (declarado === 'st') return null
    return {
      tipo: 'st_nao_declarada',
      severidade: 'media',
      mensagem: `Produto com substituição tributária de PIS/COFINS (${lei.grupo}), mas a nota saiu com ${cstLabel}. Correto: CST 05.`,
    }
  }

  if (declarado === 'monofasico') {
    return {
      tipo: 'cst_monofasico_sem_base',
      severidade: 'alta',
      mensagem: lei.ncmValido
        ? 'Nota com CST 04 (monofásico), mas o NCM não consta nas listas monofásicas da lei. Conferir NCM e CST — se o NCM estiver certo, há risco de recolhimento a menor.'
        : 'Nota com CST 04 (monofásico), mas o item está sem NCM válido — não dá para confirmar o enquadramento.',
    }
  }
  if (declarado === 'st') {
    return {
      tipo: 'cst_st_sem_base',
      severidade: 'alta',
      mensagem: 'Nota com CST 05 (substituição tributária), mas o NCM não é de cigarro nem de motocicleta. Conferir NCM e CST.',
    }
  }
  return null
}
