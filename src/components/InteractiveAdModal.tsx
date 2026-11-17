import { useEffect, useState } from 'react';
import { CheckCircle2, Clock, Gift, Sparkles, X } from 'lucide-react';
import { AdFormat, type InteractiveAdCampaign } from '../types/drama';

interface InteractiveAdModalProps {
  isOpen: boolean;
  campaign: InteractiveAdCampaign;
  seriesTitle: string;
  targetEpisodeNumber: number;
  totalEpisodes: number;
  onComplete: (bonusCount: number) => void;
  onCancel: () => void;
}

export function InteractiveAdModal({
  isOpen,
  campaign,
  seriesTitle,
  targetEpisodeNumber,
  totalEpisodes,
  onComplete,
  onCancel,
}: InteractiveAdModalProps) {
  const [secondsLeft, setSecondsLeft] = useState(campaign.durationSec);
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [quizNotice, setQuizNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    setSecondsLeft(campaign.durationSec);
    setSelectedOptionId(null);
    setQuizNotice(null);
  }, [isOpen, campaign]);

  useEffect(() => {
    if (!isOpen || secondsLeft <= 0) {
      return;
    }
    const timer = window.setInterval(() => {
      setSecondsLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isOpen, secondsLeft]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCancel();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onCancel]);

  if (!isOpen) {
    return null;
  }

  const selectedOption = campaign.options.find(
    (opt) => opt.id === selectedOptionId,
  );
  const hasInteracted = selectedOptionId !== null;
  const isTimerDone = secondsLeft === 0;
  const canUnlock = hasInteracted && isTimerDone;

  const isQuizBonusEarned =
    campaign.format === AdFormat.QuickQuiz
      ? Boolean(selectedOption?.isCorrect)
      : false;

  const effectiveUnlockCount =
    campaign.format === AdFormat.QuickQuiz
      ? isQuizBonusEarned
        ? Math.min(campaign.bonusEpisodes, totalEpisodes - targetEpisodeNumber + 1)
        : 1
      : Math.min(campaign.bonusEpisodes, totalEpisodes - targetEpisodeNumber + 1);

  const handleSelectOption = (optionId: string) => {
    setSelectedOptionId(optionId);
    if (campaign.format === AdFormat.QuickQuiz) {
      const chosen = campaign.options.find((o) => o.id === optionId);
      if (chosen?.isCorrect) {
        setQuizNotice('Tepat! Kamu berhak membuka 2 episode sekaligus.');
      } else {
        setQuizNotice('Pilihan tercatat. 1 episode tetap terbuka setelah hitungan mundur.');
      }
    }
  };

  const progressRatio =
    campaign.durationSec > 0
      ? ((campaign.durationSec - secondsLeft) / campaign.durationSec) * 100
      : 100;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ad-modal-title"
    >
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-white/12 bg-[#111114] text-[#FAFAFA] shadow-2xl">
        <div className="flex items-center justify-between gap-4 border-b border-white/8 px-5 py-4">
          <div className="min-w-0">
            <p className="text-xs text-zinc-400">
              <span>Iklan Interaktif Gratis</span>
              <span aria-hidden="true" className="mx-1.5 text-zinc-600">
                ·
              </span>
              <span className="text-amber-400 font-medium">
                {campaign.sponsorName}
              </span>
            </p>
            <h2
              id="ad-modal-title"
              className="font-display mt-0.5 text-base font-semibold text-white truncate"
            >
              Buka Episode {targetEpisodeNumber} — {seriesTitle}
            </h2>
          </div>

          <button
            type="button"
            onClick={onCancel}
            aria-label="Tutup iklan interaktif"
            className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-white/8 hover:text-white cursor-pointer focus-visible:outline-2 focus-visible:outline-[#E11D48]"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="h-1 w-full bg-white/8">
          <div
            className="h-full bg-amber-400 transition-[width] duration-300 ease-linear"
            style={{ width: `${progressRatio}%` }}
          />
        </div>

        <div className="space-y-5 p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4 border-b border-white/8 pb-4">
            <div>
              <p className="font-display text-lg font-bold text-white">
                {campaign.sponsorName}
              </p>
              <p className="mt-1 text-sm text-zinc-300">{campaign.tagline}</p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5 rounded-lg border border-white/10 bg-[#18181D] px-3 py-1.5">
              <Clock className="h-4 w-4 text-amber-400" aria-hidden="true" />
              <span className="font-mono text-xs font-semibold tabular-nums text-white">
                {isTimerDone ? 'Selesai' : `${secondsLeft} dtk`}
              </span>
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-sm font-medium text-zinc-100">
              {campaign.promptQuestion}
            </p>

            <div className="space-y-2.5" role="radiogroup" aria-label={campaign.promptQuestion}>
              {campaign.options.map((opt) => {
                const isSelected = selectedOptionId === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    onClick={() => handleSelectOption(opt.id)}
                    className={`w-full rounded-xl border p-3.5 text-left transition-colors duration-150 cursor-pointer focus-visible:outline-2 focus-visible:outline-[#E11D48] ${
                      isSelected
                        ? 'border-amber-400 bg-amber-400/10'
                        : 'border-white/10 bg-[#17171C] hover:border-white/25 hover:bg-[#1E1E24]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-semibold text-white">
                        {opt.label}
                      </span>
                      {isSelected && (
                        <CheckCircle2
                          className="h-4 w-4 shrink-0 text-amber-400"
                          aria-hidden="true"
                        />
                      )}
                    </div>
                    <p className="mt-1 text-xs text-zinc-400">{opt.detail}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {quizNotice && (
            <p className="text-xs font-medium text-amber-300">{quizNotice}</p>
          )}

          {hasInteracted && campaign.format === AdFormat.PromoReveal && campaign.voucherCode && (
            <div className="flex items-center justify-between rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3">
              <div className="flex items-center gap-2.5">
                <Gift className="h-4 w-4 text-amber-400" aria-hidden="true" />
                <span className="text-xs text-zinc-200">
                  Kode Promo Sponsor:
                </span>
              </div>
              <span className="font-mono text-sm font-bold tracking-wider text-amber-300">
                {campaign.voucherCode}
              </span>
            </div>
          )}

          {canUnlock && (
            <div className="flex items-center gap-2 text-xs text-emerald-400">
              <Sparkles className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{campaign.rewardMessage}</span>
            </div>
          )}

          <div className="flex flex-col-reverse gap-2.5 pt-1 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="button"
              onClick={onCancel}
              className="min-h-[44px] rounded-lg border border-white/10 px-4 py-2.5 text-sm font-medium text-zinc-300 transition-colors hover:bg-white/6 hover:text-white cursor-pointer"
            >
              Batal
            </button>

            <button
              type="button"
              disabled={!canUnlock}
              onClick={() => onComplete(effectiveUnlockCount)}
              className={`min-h-[44px] rounded-lg px-5 py-2.5 text-sm font-semibold transition-all duration-150 ${
                canUnlock
                  ? 'bg-[#E11D48] text-white hover:bg-[#BE123C] cursor-pointer active:scale-[0.98]'
                  : 'bg-white/10 text-zinc-400 cursor-not-allowed'
              }`}
            >
              {!hasInteracted
                ? 'Pilih salah satu opsi di atas'
                : !isTimerDone
                  ? `Menunggu ${secondsLeft} detik...`
                  : effectiveUnlockCount > 1
                    ? `Buka ${effectiveUnlockCount} Episode Sekarang`
                    : `Buka Episode ${targetEpisodeNumber} Sekarang`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
