'use client';

import React from 'react';
import { RiseGameProvider } from '@/context/RiseGameContext';
import RiseGame from '@/components/rise/RiseGame';

export default function RisePage() {
  return (
    <RiseGameProvider>
      <RiseGame />
    </RiseGameProvider>
  );
}
