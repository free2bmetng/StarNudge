export const INDUSTRIES = ['restaurant', 'salon', 'dental_medical', 'auto', 'home_services', 'fitness'] as const;
export type Industry = (typeof INDUSTRIES)[number];

export const INDUSTRY_LABELS: Record<Industry, string> = {
  restaurant: 'Restaurant',
  salon: 'Salon and barbershop',
  dental_medical: 'Dental and medical',
  auto: 'Auto shop',
  home_services: 'Home services',
  fitness: 'Fitness studio',
};

export type Language = 'en' | 'es';
export type Channel = 'sms' | 'email';
export type Kind = 'service' | 'retail';

export interface TemplateSeed {
  language: Language;
  channel: Channel;
  kind: Kind;
  subject: string | null;
  body: string;
}

/** Default copy for each industry. Dental and medical copy never uses {service}. */
export function defaultTemplates(industry: Industry): TemplateSeed[] {
  const useService = industry !== 'dental_medical';
  const serviceClause = useService ? ' for your {service}' : '';
  return [
    {
      language: 'en',
      channel: 'sms',
      kind: 'service',
      subject: null,
      body: `Hi {first_name}, thanks for choosing {business_name}${serviceClause}! If you have a minute, please share your experience: {review_link}`,
    },
    {
      language: 'en',
      channel: 'sms',
      kind: 'retail',
      subject: null,
      body: 'Hi {first_name}, thanks for shopping with {business_name}! If you have a minute, please share your experience: {review_link}',
    },
    {
      language: 'en',
      channel: 'email',
      kind: 'service',
      subject: 'Thanks for visiting {business_name}',
      body: `Hi {first_name},\n\nThank you for choosing {business_name}${serviceClause}. If you have a minute, we would appreciate you sharing your experience on Google:\n\n{review_link}\n\nThank you,\n{business_name}`,
    },
    {
      language: 'en',
      channel: 'email',
      kind: 'retail',
      subject: 'Thanks for shopping with {business_name}',
      body: 'Hi {first_name},\n\nThank you for shopping with {business_name}. If you have a minute, we would appreciate you sharing your experience on Google:\n\n{review_link}\n\nThank you,\n{business_name}',
    },
    {
      language: 'es',
      channel: 'sms',
      kind: 'service',
      subject: null,
      body: `Hola {first_name}, gracias por confiar en {business_name}${useService ? ' y su {service}' : ''}. Si tiene un momento, comparta su experiencia: {review_link}`,
    },
    {
      language: 'es',
      channel: 'sms',
      kind: 'retail',
      subject: null,
      body: 'Hola {first_name}, gracias por su compra en {business_name}. Si tiene un momento, comparta su experiencia: {review_link}',
    },
    {
      language: 'es',
      channel: 'email',
      kind: 'service',
      subject: 'Gracias por visitar {business_name}',
      body: `Hola {first_name},\n\nGracias por confiar en {business_name}${useService ? ' para su {service}' : ''}. Si tiene un momento, le agradeceríamos que comparta su experiencia en Google:\n\n{review_link}\n\nGracias,\n{business_name}`,
    },
    {
      language: 'es',
      channel: 'email',
      kind: 'retail',
      subject: 'Gracias por su compra en {business_name}',
      body: 'Hola {first_name},\n\nGracias por su compra en {business_name}. Si tiene un momento, le agradeceríamos que comparta su experiencia en Google:\n\n{review_link}\n\nGracias,\n{business_name}',
    },
  ];
}

const COPY = {
  en: {
    problem: 'Have a problem? Contact us',
    stopSms: 'Reply STOP to opt out.',
    unsubscribe: 'Unsubscribe',
  },
  es: {
    problem: '¿Tiene un problema? Contáctenos',
    stopSms: 'Responda STOP para cancelar.',
    unsubscribe: 'Cancelar suscripción',
  },
} as const;

export interface RenderInput {
  channel: Channel;
  language: Language;
  subject: string | null;
  body: string;
  firstName: string | null;
  businessName: string;
  service: string | null;
  reviewLink: string;
  supportLink: string;
  postalAddress: string;
  unsubscribeLink: string;
}

function fillTokens(text: string, values: Record<string, string>): string {
  return text.replace(/\{([a-z_]+)\}/g, (match, key: string) => (key in values ? values[key] : match));
}

/**
 * Builds the final message text. The support link and opt-out text are added
 * when the template does not already contain them, so every message carries both.
 */
export function renderMessage(input: RenderInput): { subject: string | null; text: string } {
  const copy = COPY[input.language];
  const values: Record<string, string> = {
    first_name: input.firstName || 'there',
    business_name: input.businessName,
    service: input.service || 'visit',
    review_link: input.reviewLink,
    support_link: input.supportLink,
  };
  const body = fillTokens(input.body, values);
  if (input.channel === 'sms') {
    let text = body;
    if (!text.includes(input.supportLink)) text += ` ${copy.problem}: ${input.supportLink}`;
    if (!/\bSTOP\b/i.test(text)) text += ` ${copy.stopSms}`;
    return { subject: null, text };
  }
  const subject = input.subject ? fillTokens(input.subject, values) : null;
  const footer = [
    '',
    `${copy.problem}: ${input.supportLink}`,
    '',
    input.businessName,
    input.postalAddress,
    `${copy.unsubscribe}: ${input.unsubscribeLink}`,
  ].join('\n');
  return { subject, text: `${body}\n${footer}` };
}
