import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import TopMenu from './TopMenu';
import SubPage from './SubPage';
import Standby from './Standby';
import ParentToppickPage from './ParentTopicPage';
import ParentWaiting from './ParentWaiting';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<TopMenu />} />
        <Route path="/sub" element={<SubPage />} />
        <Route path="/standby" element={<Standby />} />
        <Route path="/parenttopick" element={<ParentToppickPage />} />
        <Route path="/parentwaiting" element={<ParentWaiting />} />
        
      </Routes>
    </Router>
  );
}

export default App;
