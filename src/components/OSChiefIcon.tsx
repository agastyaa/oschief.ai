import React from 'react';
export interface OSChiefIconProps {
  size?: number;
  color?: string;
  className?: string;
  variant?: 'default' | 'connected' | 'orbital' | 'pulse' | 'minimal';
}
export function OSChiefIcon({
  size = 64,
  color = '#FFFFFF',
  className = '',
  variant = 'default'
}: OSChiefIconProps) {
  // Variant 1: Default - Clean cardinal dots (like the reference)
  if (variant === 'default') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
        aria-label="OSChief icon">
        
        {/* Central circle */}
        <circle cx="50" cy="50" r="12" fill={color} />

        {/* Cardinal dots */}
        <circle cx="50" cy="20" r="4" fill={color} />
        <circle cx="80" cy="50" r="4" fill={color} />
        <circle cx="50" cy="80" r="4" fill={color} />
        <circle cx="20" cy="50" r="4" fill={color} />
      </svg>);

  }
  // Variant 2: Connected - Dots connected with subtle lines
  if (variant === 'connected') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
        aria-label="OSChief icon">
        
        {/* Connection lines */}
        <line
          x1="50"
          y1="38"
          x2="50"
          y2="24"
          stroke={color}
          strokeWidth="2"
          opacity="0.3" />
        
        <line
          x1="62"
          y1="50"
          x2="76"
          y2="50"
          stroke={color}
          strokeWidth="2"
          opacity="0.3" />
        
        <line
          x1="50"
          y1="62"
          x2="50"
          y2="76"
          stroke={color}
          strokeWidth="2"
          opacity="0.3" />
        
        <line
          x1="38"
          y1="50"
          x2="24"
          y2="50"
          stroke={color}
          strokeWidth="2"
          opacity="0.3" />
        

        {/* Central circle */}
        <circle cx="50" cy="50" r="12" fill={color} />

        {/* Cardinal dots */}
        <circle cx="50" cy="20" r="4" fill={color} />
        <circle cx="80" cy="50" r="4" fill={color} />
        <circle cx="50" cy="80" r="4" fill={color} />
        <circle cx="20" cy="50" r="4" fill={color} />
      </svg>);

  }
  // Variant 3: Orbital - Dots on an orbital ring
  if (variant === 'orbital') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
        aria-label="OSChief icon">
        
        {/* Orbital ring */}
        <circle
          cx="50"
          cy="50"
          r="30"
          stroke={color}
          strokeWidth="1.5"
          opacity="0.2"
          fill="none" />
        

        {/* Central circle */}
        <circle cx="50" cy="50" r="10" fill={color} />

        {/* Orbital dots */}
        <circle cx="50" cy="20" r="5" fill={color} />
        <circle cx="80" cy="50" r="5" fill={color} />
        <circle cx="50" cy="80" r="5" fill={color} />
        <circle cx="20" cy="50" r="5" fill={color} />
      </svg>);

  }
  // Variant 4: Pulse - Central circle with radiating dots at varying distances
  if (variant === 'pulse') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
        aria-label="OSChief icon">
        
        {/* Central circle */}
        <circle cx="50" cy="50" r="12" fill={color} />

        {/* Inner ring of dots */}
        <circle cx="50" cy="32" r="3" fill={color} opacity="0.6" />
        <circle cx="68" cy="50" r="3" fill={color} opacity="0.6" />
        <circle cx="50" cy="68" r="3" fill={color} opacity="0.6" />
        <circle cx="32" cy="50" r="3" fill={color} opacity="0.6" />

        {/* Outer ring of dots */}
        <circle cx="50" cy="18" r="4" fill={color} />
        <circle cx="82" cy="50" r="4" fill={color} />
        <circle cx="50" cy="82" r="4" fill={color} />
        <circle cx="18" cy="50" r="4" fill={color} />
      </svg>);

  }
  // Variant 5: Minimal - Just center and one accent dot
  if (variant === 'minimal') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
        aria-label="OSChief icon">
        
        {/* Central circle */}
        <circle cx="50" cy="50" r="14" fill={color} />

        {/* Single accent dot (top right) */}
        <circle cx="68" cy="32" r="5" fill={color} opacity="0.8" />
      </svg>);

  }
  return null;
}