import { useState } from 'react'
import { ChevronRight, Settings2 } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Separator } from '@/components/ui/separator'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { generateSessions, MAX_MINUTES, type Background, type Session } from '@/lib/sessions'
import { cn } from '@/lib/utils'

type SettingsProps = {
  background: Background
  onBackground: (b: Background) => void
  sessions: Session[]
  onSessions: (list: Session[]) => void
}

const SectionTitle = ({ children }: { children: React.ReactNode }) => (
  <p className="font-mono text-[11px] tracking-wider text-muted-foreground uppercase">{children}</p>
)

export function Settings({ background, onBackground, sessions, onSessions }: SettingsProps) {
  const [devOpen, setDevOpen] = useState(false)
  const [count, setCount] = useState('200')
  const [minMinutes, setMinMinutes] = useState('5')
  const [maxMinutes, setMaxMinutes] = useState('90')
  const [resetShare, setResetShare] = useState('15')

  const n = (v: string, fallback: number) => (Number.isFinite(Number(v)) && v.trim() !== '' ? Number(v) : fallback)
  const generated = () =>
    generateSessions(
      Math.max(0, Math.min(20000, Math.round(n(count, 0)))),
      n(minMinutes, 1),
      n(maxMinutes, MAX_MINUTES),
      Math.min(1, Math.max(0, n(resetShare, 0) / 100)),
    )
  const finished = sessions.filter((s) => s.completed).length

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon-lg"
          aria-label="Settings"
          className="fixed right-4 bottom-4 z-20 text-muted-foreground opacity-40 transition-opacity hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
        >
          <Settings2 />
        </Button>
      </PopoverTrigger>
      <PopoverContent side="top" align="end" className="w-80">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <SectionTitle>Background</SectionTitle>
            <ToggleGroup
              type="single"
              variant="outline"
              value={background}
              onValueChange={(v) => v && onBackground(v as Background)}
              className="w-full"
            >
              <ToggleGroupItem value="grid" className="flex-1">
                Grid
              </ToggleGroupItem>
              <ToggleGroupItem value="topography" className="flex-1">
                Topography
              </ToggleGroupItem>
            </ToggleGroup>
          </div>

          <Separator />

          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-col">
              <SectionTitle>Sessions</SectionTitle>
              <span className="text-sm tabular-nums">
                {sessions.length} kept · {finished} finished · {sessions.length - finished} reset
              </span>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" disabled={sessions.length === 0}>
                  Reset all
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Reset all sessions?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This deletes all {sessions.length} saved sessions and clears the background. It can't be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep them</AlertDialogCancel>
                  <AlertDialogAction variant="destructive" onClick={() => onSessions([])}>
                    Reset all
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>

          <Separator />

          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={() => setDevOpen((o) => !o)}
              aria-expanded={devOpen}
              className="flex items-center gap-1 self-start rounded-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <ChevronRight className={cn('size-3.5 text-muted-foreground transition-transform', devOpen && 'rotate-90')} />
              <SectionTitle>Developer</SectionTitle>
            </button>
            {devOpen && (
              <div className="flex flex-col gap-3">
                <p className="text-xs text-muted-foreground">
                  Make test sessions to see how the backgrounds look. Replace swaps them for your real ones, so
                  reset afterwards.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <Field id="dev-count" label="Sessions" value={count} onChange={setCount} />
                  <Field id="dev-reset" label="Reset %" value={resetShare} onChange={setResetShare} />
                  <Field id="dev-min" label="Shortest (min)" value={minMinutes} onChange={setMinMinutes} />
                  <Field id="dev-max" label="Longest (min)" value={maxMinutes} onChange={setMaxMinutes} />
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="flex-1" onClick={() => onSessions(generated())}>
                    Replace
                  </Button>
                  <Button size="sm" variant="outline" className="flex-1" onClick={() => onSessions([...sessions, ...generated()])}>
                    Add
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function Field({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <Input id={id} inputMode="numeric" value={value} onChange={(e) => onChange(e.target.value)} className="h-8 tabular-nums" />
    </div>
  )
}
