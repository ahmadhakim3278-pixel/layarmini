import { useState } from 'react';
import { signInWithPopup, signOut, type User } from 'firebase/auth';
import { ArrowLeft, Loader2, Lock, LogOut, ShieldCheck } from 'lucide-react';
import { auth, googleProvider } from '../firebase';

interface AdminAuthGateProps {
  authReady: boolean;
  user: User | null;
  isAdmin: boolean;
  isCheckingAdmin: boolean;
  onNavigateHome: () => void;
}

export function AdminAuthGate({
  authReady,
  user,
  isAdmin,
  isCheckingAdmin,
  onNavigateHome,
}: AdminAuthGateProps) {
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const handleGoogleLogin = async () => {
    setAuthError(null);
    setIsSigningIn(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error: unknown) {
      const code =
        typeof error === 'object' && error !== null && 'code' in error
          ? String((error as { code?: string }).code)
          : '';
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        setAuthError(null);
      } else if (code === 'auth/unauthorized-domain') {
        setAuthError(
          `Domain "${window.location.hostname}" belum terdaftar di Firebase Authentication -> Settings -> Authorized domains. Tambahkan domain ini di Firebase Console lalu coba lagi.`,
        );
      } else {
        setAuthError(
          'Gagal masuk dengan Google. Pastikan pop-up diizinkan di browser Anda lalu coba lagi.',
        );
      }
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleSignOut = async () => {
    setAuthError(null);
    await signOut(auth);
  };

  if (!authReady || isCheckingAdmin) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#09090B] px-4 text-[#FAFAFA]">
        <Loader2 className="h-8 w-8 animate-spin text-[#E11D48]" aria-hidden="true" />
        <p className="mt-3 text-sm text-zinc-400">Memeriksa akses LayarMini Studio...</p>
      </div>
    );
  }

  if (user && !isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#09090B] px-4 py-12 text-[#FAFAFA]">
        <div className="w-full max-w-md rounded-2xl border border-white/12 bg-[#111114] p-7">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/15 text-amber-400">
            <Lock className="h-6 w-6" aria-hidden="true" />
          </div>
          <h1 className="font-display mt-5 text-2xl font-bold tracking-tight text-white">
            Akses Khusus Admin
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-zinc-400">
            Akun <span className="font-medium text-zinc-200">{user.email}</span> tidak
            terdaftar sebagai pengelola katalog LayarMini. Penonton dapat langsung
            menikmati seluruh drama di halaman utama tanpa login.
          </p>

          <div className="mt-6 flex flex-col gap-2.5 sm:flex-row">
            <button
              type="button"
              onClick={() => void handleSignOut()}
              className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-lg border border-white/15 bg-[#18181D] px-4 text-sm font-semibold text-white hover:bg-white/10 cursor-pointer"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              <span>Ganti Akun</span>
            </button>
            <button
              type="button"
              onClick={onNavigateHome}
              className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-lg bg-[#E11D48] px-4 text-sm font-semibold text-white hover:bg-[#BE123C] cursor-pointer"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              <span>Ke Beranda</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#09090B] px-4 py-12 text-[#FAFAFA]">
      <div className="w-full max-w-md rounded-2xl border border-white/12 bg-[#111114] p-7">
        <div className="flex items-center justify-between">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#E11D48]/15 text-[#E11D48]">
            <ShieldCheck className="h-6 w-6" aria-hidden="true" />
          </div>
          <button
            type="button"
            onClick={onNavigateHome}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-white/10 px-3 text-xs font-medium text-zinc-300 hover:bg-white/8 hover:text-white cursor-pointer"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Halaman Penonton</span>
          </button>
        </div>

        <h1 className="font-display mt-5 text-2xl font-bold tracking-tight text-white">
          Masuk LayarMini Studio
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-zinc-400">
          Masuk dengan akun Google admin Anda untuk mengelola drama, mengunggah video
          episode, dan menyinkronkan katalog secara real-time ke seluruh penonton di HP
          maupun laptop.
        </p>

        {authError && (
          <div
            role="alert"
            className="mt-4 rounded-xl border border-[#E11D48]/35 bg-[#E11D48]/10 px-4 py-3 text-xs leading-relaxed text-rose-200"
          >
            {authError}
          </div>
        )}

        <button
          type="button"
          disabled={isSigningIn}
          onClick={() => void handleGoogleLogin()}
          className="mt-6 flex min-h-[48px] w-full items-center justify-center gap-2.5 rounded-xl bg-[#E11D48] px-5 text-sm font-semibold text-white transition-colors hover:bg-[#BE123C] disabled:opacity-60 cursor-pointer"
        >
          {isSigningIn ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              <span>Membuka login Google...</span>
            </>
          ) : (
            <span>Masuk dengan Google (Admin)</span>
          )}
        </button>

        <p className="mt-4 text-center text-xs text-zinc-500">
          Penonton tidak perlu masuk akun untuk menonton di halaman utama.
        </p>
      </div>
    </div>
  );
}
