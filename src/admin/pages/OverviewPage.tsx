import { useCallback, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { CheckIcon, InfoIcon } from '../../components/ui/Icons'
import { contentSource } from '../../content'
import { games as localGames } from '../../data/games'
import { offers as localOffers } from '../../data/offers'
import { projects as localProjects } from '../../data/projects'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { isContactConfigured } from '../../lib/contact'
import { isFirebaseConfigured, usesEmulators } from '../../lib/firebase'
import { isOrderApiConfigured } from '../../lib/orders'
import { useAdminSession } from '../admin-context'
import { listCollection, listLatest, type RawDoc } from '../adminStore'
import { importLocalContent, type ImportItem, type ImportReport } from '../contentActions'
import { contentDeps } from '../contentDeps'
import { AdminHeading, Button, Card, ConfirmDialog, Notice } from '../components/ui'
import { RequireAdmin } from '../RequireAdmin'
import { useAdminData } from '../useAdminData'

/** Contenus RÉELS du site (src/data), sans les données de démonstration. */
const localItems: ImportItem[] = [
  ...localProjects.map((item) => ({ collection: 'projects' as const, item })),
  ...localOffers.map((item) => ({ collection: 'offers' as const, item })),
  ...localGames.map((item) => ({ collection: 'games' as const, item })),
].filter(({ item }) => !item.isDemo)

type Snapshot = { projects: RawDoc[]; offers: RawDoc[]; games: RawDoc[]; orders: RawDoc[] | null; messages: RawDoc[] | null }

async function loadSnapshot(): Promise<Snapshot> {
  const [projects, offers, games] = await Promise.all([listCollection('projects'), listCollection('offers'), listCollection('games')])
  // Commandes et messages : lecture autorisée aux administrateurs ; une collection absente donne une liste vide.
  const [orders, messages] = await Promise.all([listLatest('orders').catch(() => null), listLatest('contactMessages').catch(() => null)])
  return { projects, offers, games, orders, messages }
}

const count = (docs: RawDoc[], test: (d: RawDoc) => boolean) => docs.filter(test).length

function Stat({ to, label, value, detail, testId }: { to: string; label: string; value: number | string; detail: ReactNode; testId: string }) {
  const { t } = useTranslation()
  return (
    <Card className="flex flex-col p-5 sm:p-6" >
      <p className="text-sm font-medium text-muted">{label}</p>
      <p className="mt-1 font-display text-[2rem] font-semibold tracking-[-0.03em] text-ink" data-testid={testId}>
        {value}
      </p>
      <p className="mt-1 text-sm text-ink-soft">{detail}</p>
      <Link to={to} className="mt-4 text-sm font-semibold text-blue underline-offset-4 hover:underline">
        {t('admin.overview.manage')}
      </Link>
    </Card>
  )
}

function Overview() {
  const { t } = useTranslation()
  useDocumentTitle(t('admin.overview.title'))
  const session = useAdminSession()
  const load = useCallback(loadSnapshot, [])
  const { state, reload } = useAdminData(load)
  const [confirmImport, setConfirmImport] = useState(false)
  const [importing, setImporting] = useState(false)
  const importingRef = useRef(false)
  const [report, setReport] = useState<ImportReport | null>(null)

  const missing =
    state.status === 'ready'
      ? localItems.filter(({ collection, item }) => !state.data[collection].some((d) => d.id === item.id))
      : []

  const runImport = async () => {
    if (importingRef.current) return
    importingRef.current = true
    setImporting(true)
    try {
      setReport(await importLocalContent(contentDeps(session.uid), missing))
      setConfirmImport(false)
      reload()
    } finally {
      importingRef.current = false
      setImporting(false)
    }
  }

  const config = [
    { key: 'firebase', ok: isFirebaseConfigured },
    { key: 'functions', ok: isOrderApiConfigured },
    { key: 'contact', ok: isContactConfigured },
  ] as const

  return (
    <>
      <AdminHeading title={t('admin.overview.title')} lead={t('admin.overview.lead', { email: session.email ?? '—' })} />

      <div className="mt-8 space-y-5">
        {usesEmulators && <Notice tone="info">{t('admin.dashboard.emulators')}</Notice>}
        {contentSource === 'local' && (
          <Notice tone="info" title={t('admin.overview.sourceLocalTitle')}>
            {t('admin.overview.sourceLocalText')}
          </Notice>
        )}
        {report && (
          <Notice tone={report.failed.length ? 'error' : 'success'}>
            {t('admin.overview.importDone', { imported: report.imported.length, skipped: report.skipped.length, failed: report.failed.length })}
            {report.failed.length > 0 && <span className="mt-1 block font-mono text-[0.85rem]">{report.failed.join(', ')}</span>}
          </Notice>
        )}
        {state.status === 'ready' && missing.length > 0 && (
          <Card className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-sans text-[1.05rem] font-semibold">{t('admin.overview.importTitle')}</h2>
              <p className="mt-1 text-ink-soft">{t('admin.overview.importText', { count: missing.length })}</p>
            </div>
            <Button onClick={() => setConfirmImport(true)} className="shrink-0">
              {t('admin.overview.importButton')}
            </Button>
          </Card>
        )}
      </div>

      {state.status === 'loading' && (
        <p role="status" className="mt-8 text-muted">
          {t('admin.form.loading')}
        </p>
      )}
      {state.status === 'error' && (
        <Notice tone="error" className="mt-8">
          {t(`admin.dataErrors.${state.code}`)}{' '}
          <button type="button" onClick={reload} className="font-semibold underline underline-offset-4">
            {t('admin.retry')}
          </button>
        </Notice>
      )}
      {state.status === 'ready' && (
        <>
          <div className="mt-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            <Stat
              to="/admin/projects"
              testId="stat-projects"
              label={t('admin.nav.projects')}
              value={state.data.projects.length}
              detail={t('admin.overview.publication', {
                published: count(state.data.projects, (d) => d.data.publication === 'published'),
                draft: count(state.data.projects, (d) => d.data.publication !== 'published'),
              })}
            />
            <Stat
              to="/admin/shop"
              testId="stat-offers"
              label={t('admin.nav.shop')}
              value={state.data.offers.length}
              detail={t('admin.overview.availability', {
                available: count(state.data.offers, (d) => d.data.availability === 'available'),
                outOfStock: count(state.data.offers, (d) => d.data.availability === 'out_of_stock'),
                unavailable: count(state.data.offers, (d) => d.data.availability === 'unavailable'),
              })}
            />
            <Stat
              to="/admin/games"
              testId="stat-games"
              label={t('admin.nav.games')}
              value={state.data.games.length}
              detail={t('admin.overview.publication', {
                published: count(state.data.games, (d) => d.data.publication === 'published'),
                draft: count(state.data.games, (d) => d.data.publication !== 'published'),
              })}
            />
            {state.data.orders && (
              <Stat
                to="/admin/orders"
                testId="stat-orders"
                label={t('admin.overview.ordersToProcess')}
                value={count(state.data.orders, (d) => d.data.status === 'paid' && d.data.fulfillment !== 'delivered')}
                detail={t('admin.overview.latestNote', { count: state.data.orders.length })}
              />
            )}
            {state.data.messages && (
              <Stat
                to="/admin/messages"
                testId="stat-messages"
                label={t('admin.overview.newMessages')}
                value={count(state.data.messages, (d) => (d.data.status ?? 'new') === 'new')}
                detail={t('admin.overview.latestNote', { count: state.data.messages.length })}
              />
            )}
          </div>
        </>
      )}

      <Card className="mt-8">
        <h2 className="font-sans text-[1.05rem] font-semibold">{t('admin.dashboard.configTitle')}</h2>
        <ul className="mt-4 divide-y divide-line border-y border-line" data-testid="config-status">
          {config.map(({ key, ok }) => (
            <li key={key} className="flex items-center justify-between gap-4 py-3">
              <span className="text-ink-soft">{t(`admin.dashboard.items.${key}`)}</span>
              <span className={`inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold ${ok ? 'text-ink' : 'text-muted'}`} data-ok={ok}>
                {ok ? <CheckIcon className="size-4 text-blue" /> : <InfoIcon className="size-4" />}
                {ok ? t('admin.dashboard.configured') : t('admin.dashboard.missing')}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-sm text-muted">{t('admin.dashboard.configNote')}</p>
      </Card>

      <ConfirmDialog
        open={confirmImport}
        title={t('admin.overview.importConfirmTitle')}
        confirmLabel={t('admin.overview.importButton')}
        busy={importing}
        tone="primary"
        onCancel={() => setConfirmImport(false)}
        onConfirm={() => void runImport()}
      >
        <p>{t('admin.overview.importConfirmText', { count: missing.length })}</p>
        <ul className="mt-3 list-inside list-disc font-mono text-[0.85rem]">
          {missing.map(({ collection, item }) => (
            <li key={`${collection}/${item.id}`}>
              {collection}/{item.id}
            </li>
          ))}
        </ul>
      </ConfirmDialog>
    </>
  )
}

export default function OverviewPage() {
  return (
    <RequireAdmin>
      <Overview />
    </RequireAdmin>
  )
}
