import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import UploadPage from './pages/Upload'
import CourtRoom from './pages/CourtRoom'

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<Login />} />
        <Route path="/upload" element={<UploadPage />} />
        <Route path="/courtroom" element={<CourtRoom />} />
      </Routes>
    </Router>
  )
}

export default App
