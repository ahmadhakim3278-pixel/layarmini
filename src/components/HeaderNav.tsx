import { Bookmark, Compass, History, Home, Play } from 'lucide-react';
import { NavSection } from '../types/drama';

interface HeaderNavProps {
  activeSection: NavSection;
  onSelectSection: (section: NavSection) => void;
  onPrimaryWatch: () => void;
  hasWatchHistory: boolean;
}

const NAV_ITEMS: Array<{ id: NavSection; label: string; icon: typeof Home }> = [
  { id: NavSection.Home, label: 'Beranda', icon: Home },
  { id: NavSection.Explore, label: 'Jelajah', icon: Compass },
  { id: NavSection.Saved, label: 'Tersimpan', icon: Bookmark },
  { id: NavSection.History, label: 'Riwayat', icon: History },
];

export function HeaderNav({
  activeSection,
  onSelectSection,
  onPrimaryWatch,
  hasWatchHistory,
}: HeaderNavProps) {
  return (
    <>
      <header className="sticky top-0 z-30 border-b border-white/8 bg-[#09090B]/92 backdrop-blur-md">
        <div className="mx-auto flex h-14 md:h-16 max-w-7xl items-center justify-between gap-8 px-4 sm:px-6 lg:px-8">
          <button
            type="button"
            onClick={() => onSelectSection(NavSection.Home)}
            className="font-display text-xl font-bold tracking-tight text-[#FAFAFA] whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#E11D48] rounded-sm cursor-pointer"
          >
            LayarMini
          </button>

          <nav
            aria-label="Navigasi utama"
            className="hidden md:flex items-center gap-7"
          >
            {NAV_ITEMS.map((item) => {
              const isActive = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectSection(item.id)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`relative py-2 text-sm font-medium whitespace-nowrap shrink-0 transition-colors duration-150 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#E11D48] ${
                    isActive
                      ? 'text-[#FAFAFA]'
                      : 'text-zinc-400 hover:text-[#FAFAFA]'
                  }`}
                >
                  {item.label}
                  {isActive && (
                    <span
                      aria-hidden="true"
                      className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#E11D48]"
                    />
                  )}
                </button>
              );
            })}
          </nav>

          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={onPrimaryWatch}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-[#E11D48] px-4 py-2 text-xs sm:text-sm font-semibold text-white whitespace-nowrap shrink-0 transition-colors duration-150 hover:bg-[#BE123C] active:scale-[0.98] cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              <Play className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
              <span>{hasWatchHistory ? 'Lanjutkan' : 'Tonton Gratis'}</span>
            </button>
          </div>
        </div>
      </header>

      <nav
        aria-label="Navigasi bawah seluler"
        className="md:hidden fixed bottom-0 left-0 right-0 z-30 h-14 border-t border-white/10 bg-[#09090B]/95 backdrop-blur-md"
      >
        <div className="grid h-full grid-cols-4 items-center">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectSection(item.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`flex min-h-[44px] flex-col items-center justify-center gap-0.5 transition-colors cursor-pointer ${
                  isActive ? 'text-[#E11D48]' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Icon className="h-5 w-5" aria-hidden="true" />
                <span className="text-[11px] font-medium leading-none">
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
}
