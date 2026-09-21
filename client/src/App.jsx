import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import UploadPage from './pages/Upload'
import CourtRoom from './pages/CourtRoom'
import AIJudgeSimulationVideo from './pages/AIJudgeSimulationVideo'
import PenalCode from './pages/PenalCode'
import AISupport from './pages/AISupport'

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<Login />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/upload" element={<UploadPage />} />
        <Route path="/courtroom" element={<CourtRoom />} />
        <Route path="/courtroom-video" element={<AIJudgeSimulationVideo />} />
        <Route path="/penal-code" element={<PenalCode />} />
        <Route path="/ai-support" element={<AISupport />} />
      </Routes>
    </Router>
  )
}

export default App
