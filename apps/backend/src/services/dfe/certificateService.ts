import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'
import forge from 'node-forge'

export class CertificateError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CertificateError'
  }
}

export interface CertificateInfo {
  cnpj: string
  commonName: string
  validFrom: Date
  validUntil: Date
}

export interface EncryptedCertificate {
  pfxData: Buffer
  pfxPassword: string
}

export interface DecryptedCertificate {
  pfxBuffer: Buffer
  password: string
}

const IV_LENGTH = 12
const AUTH_TAG_LENGTH = 16

function getEncryptionKey(): Buffer {
  const raw = process.env.CERT_ENCRYPTION_KEY
  if (!raw) {
    throw new Error('CERT_ENCRYPTION_KEY environment variable is required')
  }
  const key = Buffer.from(raw, 'hex')
  if (key.length !== 32) {
    throw new Error('CERT_ENCRYPTION_KEY must be a 64-character hex string (32 bytes) — generate with: openssl rand -hex 32')
  }
  return key
}

/** Encrypts a buffer with AES-256-GCM. Output layout: iv (12) | authTag (16) | ciphertext */
function encryptToBuffer(plain: Buffer): Buffer {
  const key = getEncryptionKey()
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()])
  const authTag = cipher.getAuthTag()
  return Buffer.concat([iv, authTag, ciphertext])
}

function decryptFromBuffer(payload: Buffer): Buffer {
  const key = getEncryptionKey()
  const iv = payload.subarray(0, IV_LENGTH)
  const authTag = payload.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH)
  const ciphertext = payload.subarray(IV_LENGTH + AUTH_TAG_LENGTH)
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(authTag)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()])
}

/** Encrypts the .pfx bytes and its password for storage in CompanyCertificate. */
export function encryptCertificate(pfxBuffer: Buffer, password: string): EncryptedCertificate {
  return {
    pfxData: encryptToBuffer(pfxBuffer),
    pfxPassword: encryptToBuffer(Buffer.from(password, 'utf-8')).toString('base64'),
  }
}

/** Decrypts a stored certificate back into the raw .pfx bytes and password, ready for mTLS use. */
export function decryptCertificate(pfxData: Buffer, pfxPassword: string): DecryptedCertificate {
  return {
    pfxBuffer: decryptFromBuffer(pfxData),
    password: decryptFromBuffer(Buffer.from(pfxPassword, 'base64')).toString('utf-8'),
  }
}

/**
 * Opens a PKCS#12 (.pfx/.p12) bundle with the given password and extracts the
 * certificate's CNPJ (from the e-CNPJ subject CN, formatted "RAZAO SOCIAL:CNPJ")
 * and validity window. Throws CertificateError with a user-facing message on
 * invalid file/password so routes can surface it directly.
 */
export function readCertificateInfo(pfxBuffer: Buffer, password: string): CertificateInfo {
  let p12Asn1: forge.asn1.Asn1
  try {
    const der = forge.util.createBuffer(pfxBuffer.toString('binary'))
    p12Asn1 = forge.asn1.fromDer(der)
  } catch {
    throw new CertificateError('Arquivo de certificado inválido. Envie um arquivo .pfx ou .p12 válido.')
  }

  let p12: forge.pkcs12.Pkcs12Pfx
  try {
    p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, password)
  } catch {
    throw new CertificateError('Não foi possível abrir o certificado. Verifique a senha informada.')
  }

  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] || []
  const certBag = certBags.find((bag) => bag.cert)
  if (!certBag?.cert) {
    throw new CertificateError('Não foi possível localizar o certificado dentro do arquivo enviado.')
  }

  const cert = certBag.cert
  const cnAttr = cert.subject.getField('CN')
  const commonName: string = cnAttr?.value || ''

  const cnpjMatch = commonName.match(/(\d{14})/)
  if (!cnpjMatch) {
    throw new CertificateError(
      'Não foi possível identificar o CNPJ no certificado. Use um certificado e-CNPJ (A1) válido.'
    )
  }

  return {
    cnpj: cnpjMatch[1],
    commonName,
    validFrom: cert.validity.notBefore,
    validUntil: cert.validity.notAfter,
  }
}
