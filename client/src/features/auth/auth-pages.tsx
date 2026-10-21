import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowRight, Check, Eye, EyeOff, LoaderCircle, ShieldCheck, Ticket } from 'lucide-react';
import { useApp } from '../../app/context';
import { Button } from '../../components/ui/button';
import { FieldError, InlineMessage, Logo } from '../../components/shared/primitives';
import { loginSchema, type LoginInput } from './schema';
import { errorMessage } from '../../lib/utils';

function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="auth-layout">
      <section className="auth-story">
        <Logo />
        <div className="auth-story-content">
          <span className="eyebrow text-primary">LESS FRICTION. MORE RESOLUTION.</span>
          <h1>
            Great support.
            <br />
            Starts with a<br />
            <span>clear workspace.</span>
          </h1>
          <p>
            Bring your people, requests, and resolutions together. Give every issue a place to move
            forward.
          </p>
          <div className="auth-preview">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Ticket size={18} />
                Your support, in sync
              </span>
              <span className="badge badge-resolved">
                <Check size={12} />
                All connected
              </span>
            </div>
            <div className="mt-6 grid grid-cols-3 gap-4">
              {[
                ['01', 'Submit'],
                ['02', 'Collaborate'],
                ['03', 'Resolve'],
              ].map(([number, title]) => (
                <div key={number}>
                  <span className="text-2xl font-light text-primary">{number}</span>
                  <p className="mt-1 text-xs text-muted-foreground">{title}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          A BuiltByJayr project · IT support workspace
        </p>
      </section>
      <section className="auth-form-side">
        <div className="w-full max-w-[420px]">{children}</div>
      </section>
    </main>
  );
}
export function LoginPage() {
  const { user, login, isLoading, authError } = useApp();
  const navigate = useNavigate();
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState('');
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '', remember: false },
  });
  if (user) return <Navigate to="/" replace />;
  return (
    <AuthLayout>
      <div className="mb-8 flex size-12 items-center justify-center rounded-2xl border border-border bg-accent">
        <ShieldCheck className="text-primary" size={24} />
      </div>
      <h2 className="text-3xl font-semibold tracking-tight">Welcome to ResolveDesk</h2>
      <p className="mb-7 mt-3 text-sm text-muted-foreground">
        Your team's next resolution starts here.
      </p>
      {authError && (
        <InlineMessage error>
          Unable to restore your session. Check the API connection and try again.
        </InlineMessage>
      )}
      <form
        noValidate
        onSubmit={handleSubmit(async (values) => {
          setError('');
          try {
            await login(values.email, values.password, values.remember);
            navigate('/');
          } catch (e) {
            setError(errorMessage(e));
          }
        })}
        className="space-y-5"
      >
        <div>
          <label className="label" htmlFor="email">
            Email address
          </label>
          <input
            id="email"
            className="input"
            type="email"
            autoComplete="username"
            {...register('email')}
            aria-invalid={!!errors.email}
            aria-describedby="email-error"
          />
          <FieldError id="email-error" message={errors.email?.message} />
        </div>
        <div>
          <label className="label" htmlFor="password">
            Password
          </label>
          <div className="relative">
            <input
              id="password"
              className="input pr-12"
              type={visible ? 'text' : 'password'}
              autoComplete="current-password"
              {...register('password')}
              aria-invalid={!!errors.password}
              aria-describedby="password-error"
            />
            <button
              type="button"
              className="absolute right-3 top-3 text-muted-foreground"
              aria-label={visible ? 'Hide password' : 'Show password'}
              onClick={() => setVisible(!visible)}
            >
              {visible ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          <FieldError id="password-error" message={errors.password?.message} />
        </div>
        <div className="flex items-center justify-between gap-3 text-xs">
          <label className="flex items-center gap-2">
            <input type="checkbox" {...register('remember')} />
            Keep me signed in for 7 days
          </label>
          <Link to="/forgot-password" className="text-primary hover:underline">
            Forgot password?
          </Link>
        </div>
        {error && <InlineMessage error>{error}</InlineMessage>}
        <Button className="w-full" disabled={isSubmitting || isLoading}>
          {isSubmitting ? <LoaderCircle className="animate-spin" /> : null}
          {isSubmitting ? 'Opening workspace…' : 'Sign in'}
          {!isSubmitting && <ArrowRight />}
        </Button>
      </form>
      <p className="mt-6 text-center text-xs text-muted-foreground">
        Accounts are provided by your organization administrator.
      </p>
    </AuthLayout>
  );
}
export function ForgotPasswordPage() {
  return (
    <AuthLayout>
      <h2 className="text-3xl font-semibold">Password recovery</h2>
      <div className="my-6">
        <InlineMessage>
          Password recovery is not yet available. Contact your administrator. No reset email will be
          sent from this page.
        </InlineMessage>
      </div>
      <Link to="/login" className="text-primary">
        Back to sign in
      </Link>
    </AuthLayout>
  );
}
