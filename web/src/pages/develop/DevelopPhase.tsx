import PhaseLayout from '../../components/PhaseLayout'
import GroovyIDE from '../../tools/GroovyIDE'
import IFlowScaffold from './IFlowScaffold'
import XSDGenerator from '../../tools/XSDGenerator'
import XSLTMapEditor from '../../tools/XSLTMapEditor'
const DEVELOP_NAV = [
  { id: 'map-editor',     label: 'XSLT Map Editor',  icon: 'map-2'               },
  { id: 'xsd-generator',  label: 'XSD Generator',    icon: 'document-text'       },
  { id: 'groovy',         label: 'Groovy IDE',        icon: 'source-code'         },
  { id: 'iflow-scaffold', label: 'iFlow Scaffold',    icon: 'puzzle'              },
  { id: 'tech-spec',      label: 'Tech Spec',         icon: 'bbyd-active-tasks'   },
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
          {id === 'map-editor'     && <XSLTMapEditor />}
          {id === 'xsd-generator'  && <XSDGenerator />}
          {id === 'groovy'         && <GroovyIDE />}
          {id === 'iflow-scaffold' && <IFlowScaffold />}
          {id === 'tech-spec'      && <Placeholder title="Tech Spec Generation" description="Export interface diagram + metadata to a structured Word/PDF template. POC pending." />}
        </>
      )}
    </PhaseLayout>
  )
}
