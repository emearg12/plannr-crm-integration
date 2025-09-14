import React from 'react';

function App() {
  return (
    <div style={{padding: '20px', fontFamily: 'Arial'}}>
      <h1>MKFA Test App</h1>
      <p>If you can see this styled text, React is working.</p>
      <button onClick={() => alert('React is working!')}>
        Test Button
      </button>
    </div>
  );
}

export default App;
