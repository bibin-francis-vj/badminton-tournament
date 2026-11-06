import React from 'react';
import { Loader2 } from 'lucide-react';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  text?: string;
  fullScreen?: boolean;
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ 
  size = 'md', 
  text = 'Loading...',
  fullScreen = false 
}) => {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-8 h-8',
    lg: 'w-12 h-12',
    xl: 'w-16 h-16'
  };

  const textSizeClasses = {
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-lg',
    xl: 'text-xl'
  };

  if (fullScreen) {
    return (
      <div className="fixed inset-0 bg-gradient-to-br from-slate-950 via-indigo-950 to-indigo-900 flex items-center justify-center z-50 px-6">
        <div className="pointer-events-none absolute w-72 h-72 rounded-full bg-lime-400/15 blur-3xl animate-pulse" aria-hidden="true" />
        <div className="relative text-center">
          <Loader2 className={`${sizeClasses[size]} text-lime-300 animate-spin mx-auto mb-5`} />
          <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-lime-300 mb-1">Cubet Badminton · Season 2</p>
          <p className={`${textSizeClasses[size]} text-white font-semibold`}>{text}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center p-8">
      <Loader2 className={`${sizeClasses[size]} text-indigo-600 animate-spin mb-3`} />
      <p className={`${textSizeClasses[size]} text-gray-600 font-medium`}>{text}</p>
    </div>
  );
};
