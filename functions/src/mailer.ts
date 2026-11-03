/**
 * Envoi d'e-mails côté serveur (SMTP), utilisé par le formulaire de contact.
 * Le mot de passe SMTP est un secret Firebase (SMTP_PASSWORD) : il n'existe ni dans le
 * site, ni dans Git, ni dans les journaux. Voir docs/integrations.md.
 */
export type OutgoingMail = { to: string; subject: string; text: string; replyTo: { name: string; address: string } }

export interface Mailer {
  send(mail: OutgoingMail): Promise<{ messageId?: string }>
}

export type SmtpConfig = { host: string; port: number; user: string; pass: string }

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

/** Configuration complète et plausible, sinon null (l'envoi est alors désactivé, jamais simulé). */
export function smtpConfig(values: { host?: string; port?: string | number; user?: string; pass?: string }): SmtpConfig | null {
  const host = (values.host ?? '').trim()
  const port = Number(values.port)
  const user = (values.user ?? '').trim()
  const pass = values.pass ?? ''
  if (!/^[a-z0-9.-]+$/i.test(host) || !Number.isInteger(port) || port < 1 || port > 65535) return null
  if (!EMAIL.test(user) || pass.trim() === '') return null
  return { host, port, user, pass }
}

/** Transport SMTP (nodemailer) avec chiffrement obligatoire et délais bornés. */
export function createSmtpMailer(config: SmtpConfig): Mailer {
  let transport: Promise<import('nodemailer').Transporter> | null = null
  const getTransport = () =>
    (transport ??= import('nodemailer').then((nodemailer) =>
      nodemailer.default.createTransport({
        host: config.host,
        port: config.port,
        // 465 : TLS implicite ; 587 : STARTTLS exigé (requireTLS).
        secure: config.port === 465,
        requireTLS: config.port !== 465,
        auth: { user: config.user, pass: config.pass },
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 20_000,
      }),
    ))
  return {
    async send(mail) {
      const info = await (await getTransport()).sendMail({
        from: { name: 'Site Krimossimo', address: config.user },
        to: mail.to,
        replyTo: mail.replyTo,
        subject: mail.subject,
        text: mail.text,
      })
      return { messageId: info.messageId }
    },
  }
}
