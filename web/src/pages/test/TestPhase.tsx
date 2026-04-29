import PhaseLayout from '../../components/PhaseLayout'
import HttpClient from '../../tools/HttpClient'
import MockServer from '../../tools/MockServer'
import SchedulerTool from '../../tools/Scheduler'
import TestDataGen from '../../tools/TestDataGen'
import TestPacks from '../../tools/TestPacks'
import VolumeRunner from '../../tools/VolumeRunner'

const TEST_NAV = [
  { id: 'http-client',   label: 'HTTP Client',       icon: 'internet-browser'  },
  { id: 'test-packs',    label: 'Test Packs',         icon: 'task'              },
  { id: 'volume-runner', label: 'Volume Runner',      icon: 'time-overtime'     },
  { id: 'scheduler',     label: 'Scheduler',          icon: 'appointment-2'     },
  { id: 'mock-server',   label: 'HTTP Mock Server',   icon: 'simulate'          },
  { id: 'test-data',     label: 'Test Data Generator',icon: 'generate-shortcut' },
]


export default function TestPhase() {
  return (
    <PhaseLayout storageKey="v2-test" items={TEST_NAV}>
      {(id) => (
        <>
          {id === 'http-client'   && <HttpClient />}
          {id === 'test-packs'    && <TestPacks />}
          {id === 'volume-runner' && <VolumeRunner />}
          {id === 'scheduler'     && <SchedulerTool />}
          {id === 'mock-server'   && <MockServer />}
          {id === 'test-data'     && <TestDataGen />}
        </>
      )}
    </PhaseLayout>
  )
}
