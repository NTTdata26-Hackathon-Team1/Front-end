import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import TopMenu from './TopMenu';
import SubPage from './SubPage';
import Standby from './Standby';
import ParentToppickPage from './ParentTopicPage';
import ChildAnswer from './ChildAnswer';
import ChildWaiting from './ChildWaiting';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<TopMenu />} />
        <Route path="/sub" element={<SubPage />} />
        <Route path="/standby" element={<Standby />} />
        <Route path="/parenttopick" element={<ParentToppickPage />} />
        <Route path="/childwating" element={<ChildWaiting />} />
        <Route path="/childanswer" element={<ChildAnswer />} />
        
      </Routes>
    </Router>
  );
}

export default App;
