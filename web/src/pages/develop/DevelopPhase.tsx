import PhaseLayout from '../../components/PhaseLayout'
import GroovyIDE from '../../tools/GroovyIDE'

const DEVELOP_NAV = [
  { id: 'map-editor',    label: 'XSLT Map Editor',  icon: 'map-2'               },
  { id: 'groovy',        label: 'Groovy IDE',        icon: 'source-code'         },
  { id: 'iflow-scaffold',label: 'iFlow Scaffold',    icon: 'puzzle'              },
  { id: 'tech-spec',     label: 'Tech Spec',         icon: 'document-text'       },
]

function Placeholder({ title, description }: { title: string; description: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '4rem 2rem', gap: '0.75rem' }}>
      <span style={{ fontFamily: 'var(--sapFontHeaderFamily)', fontSize: 'var(--sapFontHeader3Size)', color: 'var(--sapTextColor)' }}>{title}</span>
      <span style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.875rem', color: 'var(--sapContent_LabelColor)', textAlign: 'center', maxWidth: '480px' }}>{description}</span>
    </div>
  )
}

export default function DevelopPhase() {
  return (
    <PhaseLayout storageKey="v2-develop" items={DEVELOP_NAV}>
      {(id) => (
        <>
          {id === 'map-editor'     && <Placeholder title="XSLT Map Editor"   description="XSD-aware map editor. Source and target XSDs pulled from the project XSD library. Coming in Step 3." />}
          {id === 'groovy'         && <GroovyIDE />}
          {id === 'iflow-scaffold' && <Placeholder title="iFlow Scaffold"     description="Generate iFlow packages referencing project XSDs, maps, and scripts. Migrating and enhancing from V1 in Step 2." />}
          {id === 'tech-spec'      && <Placeholder title="Tech Spec Generation" description="Export interface diagram + metadata to a structured Word/PDF template. POC pending." />}
        </>
      )}
    </PhaseLayout>
  )
}
