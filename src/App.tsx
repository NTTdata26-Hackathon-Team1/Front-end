import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import TopMenu from './TopMenu';
import SubPage from './SubPage';
import Standby from './Standby';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<TopMenu />} />
        <Route path="/sub" element={<SubPage />} />
        <Route path="/standby" element={<Standby />} />
      </Routes>
    </Router>
  );
}

export default App;
