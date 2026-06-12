import React from 'react';
import { AppProvider } from '../state/AnnotationContext';
import { MainLayout } from './MainLayout';

export default function App() {
  return (
    <AppProvider>
      <MainLayout />
    </AppProvider>
  );
}
