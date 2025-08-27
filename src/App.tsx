import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import TopMenu from './TopMenu';
import SubPage from './SubPage';
import Standby from './Standby';
import ParentToppickPage from './ParentTopicPage';
import ParentWaiting from './ParentWaiting';
import ChildAnswer from './ChildAnswer';
import ChildWaiting from './ChildWaiting';
import LastAnswer from './lastAnswer';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<TopMenu />} />
        <Route path="/sub" element={<SubPage />} />
        <Route path="/standby" element={<Standby />} />
        <Route path="/parenttopick" element={<ParentToppickPage />} />
        <Route path="/parentwaiting" element={<ParentWaiting />} />
        <Route path="/childwating" element={<ChildWaiting />} />
        <Route path="/childanswer" element={<ChildAnswer />} />
        <Route path="/lastanswer" element={<LastAnswer />} />
      </Routes>
    </Router>
  );
}

export default App;
