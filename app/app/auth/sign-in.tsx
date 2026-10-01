import { useEffect, useRef, useState } from 'react';
import { Redirect, router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/features/auth/provider';
import { AuthServiceError, authService } from '@/features/auth/service';
import { AuthLoadingScreen } from '@/features/auth/loading-screen';
import { SignInScreen } from '@/features/auth/sign-in-screen';

export default function SignInRoute() {
  const auth = useAuth();
  const { t } = useTranslation();
  const [stage, setStage] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const pending = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      mounted.current = false;
      clearInterval(timer);
    };
  }, []);

  const run = async (operation: () => Promise<void>, message: string) => {
    if (pending.current || !auth.configured) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    try {
      await operation();
    } catch (caught) {
      if (mounted.current)
        setError(
          caught instanceof AuthServiceError && caught.code === 'storage'
            ? t('auth.sessionError')
            : caught instanceof AuthServiceError && caught.code === 'network'
              ? t('auth.actionError')
              : message,
        );
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const sendCode = () => {
    if (Date.now() < resendAt) return;
    void run(async () => {
      const normalized = email.trim();
      await authService.sendEmailCode(normalized);
      if (!mounted.current) return;
      setEmail(normalized);
      setCode('');
      setStage('code');
      setResendAt(Date.now() + 60_000);
      setNow(Date.now());
    }, t('auth.actionError'));
  };

  if (auth.loading || auth.failed) return <AuthLoadingScreen />;
  if (auth.session) return <Redirect href="/auth/account" />;
  return (
    <SignInScreen
      ready={auth.configured}
      busy={busy}
      stage={stage}
      email={email}
      code={code}
      error={error}
      resendAfter={Math.max(0, Math.ceil((resendAt - now) / 1000))}
      onEmailChange={setEmail}
      onCodeChange={(value) => setCode(value.replace(/\D/g, '').slice(0, 6))}
      onSendCode={sendCode}
      onVerifyCode={() => {
        if (!/^\d{6}$/.test(code)) return;
        void run(async () => {
          await authService.verifyEmailCode(email, code);
        }, t('auth.codeError'));
      }}
      onProvider={(provider) => {
        void run(async () => {
          await authService.signInWithProvider(provider);
        }, t('auth.providerError'));
      }}
      onChangeEmail={() => {
        if (pending.current) return;
        setStage('email');
        setCode('');
        setError(null);
      }}
      onDemo={() => router.push('/demo')}
    />
  );
}
