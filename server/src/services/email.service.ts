import nodemailer from 'nodemailer'

import { env, isProduction } from '@/config/env'

const transporter =
  env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS
    ? nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT ?? 587,
        secure: env.SMTP_PORT === 465,
        auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
      })
    : null

async function sendMail(to: string, subject: string, html: string) {
  if (!transporter) {
    // No SMTP configured: log the email instead of failing, so local
    // development and early phases can proceed without a mail provider.
    if (!isProduction) {
      console.log(`\n📧  Email to ${to} — ${subject}\n${html}\n`)
      return
    }
    throw new Error('Email transport is not configured')
  }

  await transporter.sendMail({ from: env.EMAIL_FROM, to, subject, html })
}

export async function sendVerificationEmail(to: string, name: string, link: string) {
  await sendMail(
    to,
    'Verify your Xenospace account',
    `<p>Hi ${name},</p><p>Welcome to Xenospace. Please verify your email by clicking the link below:</p><p><a href="${link}">${link}</a></p><p>This link expires in 24 hours.</p>`
  )
}

export async function sendPasswordResetEmail(to: string, name: string, link: string) {
  await sendMail(
    to,
    'Reset your Xenospace password',
    `<p>Hi ${name},</p><p>You requested a password reset. Click the link below to choose a new password:</p><p><a href="${link}">${link}</a></p><p>This link expires in 1 hour. If you did not request this, you can ignore this email.</p>`
  )
}
