import { useTranslation } from 'react-i18next'
import { Hero } from '../components/home/Hero'
import { RolesMarquee } from '../components/home/RolesMarquee'
import { ProjectsPreview } from '../components/home/ProjectsPreview'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

export default function HomePage() {
  const { t } = useTranslation()
  useDocumentTitle(t('meta.tagline'))

  return (
    <>
      <Hero />
      <RolesMarquee />
      <ProjectsPreview />
    </>
  )
}
