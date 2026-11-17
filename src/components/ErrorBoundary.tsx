import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    let readable = 'Terjadi gangguan sinkronisasi data.';
    if (error.message.includes('permission') || error.message.includes('PERMISSION_DENIED')) {
      readable =
        'Akses database ditolak. Pastikan Anda login dengan akun admin yang terdaftar.';
    } else if (error.message.includes('Quota exceeded')) {
      readable =
        'Batas penggunaan harian database tercapai. Silakan coba lagi besok.';
    }
    return { hasError: true, message: readable };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('LayarMini ErrorBoundary:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-[#09090B] px-4 text-[#FAFAFA]">
          <div className="w-full max-w-md rounded-2xl border border-white/12 bg-[#111114] p-8 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#E11D48]/15 text-[#E11D48]">
              <AlertTriangle className="h-6 w-6" aria-hidden="true" />
            </div>
            <h1 className="font-display mt-4 text-xl font-bold text-white">
              Koneksi Terganggu
            </h1>
            <p className="mt-2 text-sm text-zinc-400">{this.state.message}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-6 inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-[#E11D48] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#BE123C] cursor-pointer"
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              <span>Muat Ulang Halaman</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
