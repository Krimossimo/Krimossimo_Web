import { useTranslation } from 'react-i18next'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { isRecord } from '../../content/validation'
import { ContentList } from '../components/ContentList'
import { Badge } from '../components/ui'
import { RequireAdmin } from '../RequireAdmin'

function Projects() {
  const { t } = useTranslation()
  useDocumentTitle(t('admin.projects.title'))
  return (
    <ContentList
      collection="projects"
      title={t('admin.projects.title')}
      lead={t('admin.projects.lead')}
      newLabel={t('admin.projects.new')}
      basePath="/admin/projects"
      emptyText={t('admin.projects.empty')}
      describe={(doc) => ({
        imageSrc: isRecord(doc.data.cover) && typeof doc.data.cover.src === 'string' ? doc.data.cover.src : undefined,
        meta: typeof doc.data.category === 'string' ? t(`categories.${doc.data.category}`, { defaultValue: doc.data.category }) : null,
        badges: (
          <>
            {doc.data.kind === 'client' ? (
              <Badge>{t('admin.projects.kinds.client.badge')}</Badge>
            ) : (
              <Badge tone="solid">{t('admin.projects.kinds.personal.badge')}</Badge>
            )}
            {doc.data.featured === true && <Badge tone="blue">{t('admin.projects.fields.featured')}</Badge>}
          </>
        ),
      })}
    />
  )
}

export default function ProjectsPage() {
  return (
    <RequireAdmin>
      <Projects />
    </RequireAdmin>
  )
}
