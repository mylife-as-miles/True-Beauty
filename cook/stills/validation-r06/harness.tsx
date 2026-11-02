import React from 'react';
import {createRoot} from 'react-dom/client';
import '../../../apps/web/src/styles.css';
import ValidationLab from '../../../apps/web/src/components/ValidationLab';
createRoot(document.getElementById('root')!).render(<main style={{padding:'28px',background:'#fffdfa',minHeight:'100vh'}}><ValidationLab/></main>);
