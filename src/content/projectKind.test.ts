import { describe, expect, it } from 'vitest'
import { parseProject } from './validation'
import { splitProjectsByKind } from './queries'
import { emptyProjectForm, projectFormFromDoc, projectInput, validateProjectForm } from '../admin/forms'

const base = {
  id: 'mon-projet',
  title: 'Mon projet',
  description: 'Une description.',
  category: 'website',
  createdAt: '2026-11-19',
  publication: 'published',
}

describe('projets perso / pour un tiers', () => {
  it('lit le type (absent = perso) et le nom du client', () => {
    const perso = parseProject(base)
    expect(perso.ok && perso.value.kind).toBe(undefined)
    const tiers = parseProject({ ...base, kind: 'client', clientName: '  Atelier Dupont ' })
    expect(tiers.ok).toBe(true)
    expect(tiers.ok && tiers.value.kind).toBe('client')
    expect(tiers.ok && tiers.value.clientName).toBe('Atelier Dupont')
    expect(parseProject({ ...base, kind: 'autre' }).ok).toBe(false)
  })

  it('sépare les projets perso des projets pour des tiers', () => {
    const list = [{ kind: undefined }, { kind: 'client' as const }, { kind: 'personal' as const }]
    const { personal, client } = splitProjectsByKind(list)
    expect(personal).toHaveLength(2)
    expect(client).toHaveLength(1)
  })

  it('formulaire admin : perso par défaut, tiers avec nom facultatif', () => {
    expect(emptyProjectForm().kind).toBe('personal')
    const form = { ...emptyProjectForm(), ...projectFormFromDoc('mon-projet', base) }
    expect(projectInput(form, '').kind).toBe(undefined)
    const tiers = { ...form, kind: 'client' as const, clientName: ' Atelier Dupont ' }
    expect(projectInput(tiers, '')).toMatchObject({ kind: 'client', clientName: 'Atelier Dupont' })
    expect(projectInput({ ...tiers, clientName: '' }, '').clientName).toBe(undefined)
    expect(validateProjectForm({ ...tiers, clientName: 'x'.repeat(121) }).clientName).toMatchObject({ code: 'tooLong' })
  })
})
