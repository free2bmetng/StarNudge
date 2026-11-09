'use server';

import { redirect } from 'next/navigation';
import { destroySession, setSessionCookie } from '@/lib/auth';
import { createSessionRow, logIn, signUp } from '@/lib/services/accounts';
import { back, text } from './_form';

export async function signUpAction(form: FormData): Promise<void> {
  const result = await signUp({
    email: text(form, 'email'),
    password: text(form, 'password'),
    businessName: text(form, 'businessName'),
    industry: text(form, 'industry'),
    timeZone: text(form, 'timeZone'),
    postalAddress: text(form, 'postalAddress'),
  });
  if (!result.ok) back('/signup', result.error);
  const token = await createSessionRow(result.userId, result.businessId);
  await setSessionCookie(token);
  redirect('/onboarding');
}

export async function logInAction(form: FormData): Promise<void> {
  const result = await logIn(text(form, 'email'), text(form, 'password'));
  if (!result.ok) back('/login', result.error);
  const token = await createSessionRow(result.userId, result.businessId);
  await setSessionCookie(token);
  redirect('/dashboard');
}

export async function logOutAction(): Promise<void> {
  await destroySession();
  redirect('/login');
}
