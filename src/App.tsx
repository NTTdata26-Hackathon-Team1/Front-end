import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import './App.css';
import TopMenu from './TopMenu';
import SubPage from './SubPage';
import Standby from './Standby';
import ParentToppickPage from './ParentTopicPage';
import ParentWaiting from './ParentWaiting';
import ChildAnswer from './ChildAnswer';
import ChildWaiting from './ChildWaiting';
import LastAnswer from './lastAnswer';
import SelectedAnswer from './SelectedAnswer';
import ParentSelectAnser from './ParentSelectAnswer';
import ChildAnswerList from './ChildAnswerList';

const soilCount = Math.ceil(window.innerWidth / 64) + 2; // 画像幅に合わせて調整

function App() {
  return (
    <div className="retro-bg">
      <Router>
        <Routes>
          <Route path="/" element={<TopMenu />} />
          <Route path="/sub" element={<SubPage />} />
          <Route path="/standby" element={<Standby />} />
          <Route path="/parenttopick" element={<ParentToppickPage />} />
          <Route path="/parentwaiting" element={<ParentWaiting />} />
          <Route path="/childwating" element={<ChildWaiting />} />
          <Route path="/childanswer" element={<ChildAnswer />} />
          <Route path="/childanswerlist" element={<ChildAnswerList />} />
          <Route path="/parentselectanswer" element={<ParentSelectAnser />} />
          <Route path="/selectedanswer" element={<SelectedAnswer />} />
          <Route path="/lastanswer" element={<LastAnswer />} />
        </Routes>
      </Router>

      {/* 背景 */}
      <div className="ground-soil">
        {Array.from({ length: soilCount }).map((_, i) => (
          <img
            key={i}
            src="/tile_soil.png"
            alt="soil"
            className="soil-img"
          />
        ))}
      </div>
    </div>
  );
}

export default App;
