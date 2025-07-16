import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const RefreshButton = ({ 
  onRefresh, 
  disabled = false, 
  size = 'normal',
  className = '' 
}) => {
  const [cooldown, setCooldown] = useState(0);
  const [isOnCooldown, setIsOnCooldown] = useState(false);

  const startCooldown = () => {
    setIsOnCooldown(true);
    setCooldown(30);
  };

  useEffect(() => {
    if (cooldown > 0) {
      const timer = setTimeout(() => {
        setCooldown(cooldown - 1);
      }, 1000);
      return () => clearTimeout(timer);
    } else if (isOnCooldown) {
      setIsOnCooldown(false);
    }
  }, [cooldown, isOnCooldown]);

  const handleClick = () => {
    if (isOnCooldown || disabled) return;
    startCooldown();
    onRefresh();
  };

  const isDisabled = disabled || isOnCooldown;
  const progress = isOnCooldown ? ((30 - cooldown) / 30) * 100 : 0;

  const sizeClasses = {
    small: 'px-3 py-1.5 text-sm',
    normal: 'px-4 py-2 text-sm',
    large: 'px-6 py-3 text-base'
  };

  return (
    <button
      onClick={handleClick}
      disabled={isDisabled}
      title={isOnCooldown ? `Please wait ${cooldown} seconds` : 'Refresh data'}
      className={`
        group relative overflow-hidden inline-flex items-center justify-center
        ${sizeClasses[size]}
        ${isDisabled 
          ? 'bg-gray-300 text-gray-500 cursor-not-allowed' 
          : 'bg-blue-500 hover:bg-blue-600 text-white hover:shadow-lg hover:-translate-y-0.5'
        }
        rounded-lg font-medium transition-all duration-300 ease-in-out
        focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
        ${className}
      `}
    >
      {/* Background shimmer effect during cooldown */}
      {isOnCooldown && (
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-pulse" />
      )}
      
      {/* Button content */}
      <div className="relative flex items-center space-x-2">
        {isOnCooldown ? (
          <>
            {/* Circular progress indicator */}
            <div className="relative w-5 h-5">
              <svg 
                className="w-5 h-5 transform -rotate-90" 
                viewBox="0 0 24 24"
              >
                {/* Background circle */}
                <circle
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="2"
                  fill="none"
                  className="text-gray-300"
                />
                {/* Progress circle */}
                <circle
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="2"
                  fill="none"
                  strokeLinecap="round"
                  className="text-blue-600"
                  style={{
                    strokeDasharray: '62.83',
                    strokeDashoffset: 62.83 - (progress * 62.83) / 100,
                    transition: 'stroke-dashoffset 1s linear'
                  }}
                />
              </svg>
              {/* Animated countdown number */}
              <AnimatePresence mode="wait">
                <motion.span 
                  key={cooldown}
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 1.2, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="absolute inset-0 flex items-center justify-center text-xs font-bold"
                >
                  {cooldown}
                </motion.span>
              </AnimatePresence>
            </div>
            <span className="hidden sm:inline">Wait...</span>
          </>
        ) : (
          <>
            {/* Refresh icon with rotation animation on hover */}
            <svg 
              className="w-4 h-4 transition-transform duration-300 group-hover:rotate-180" 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={2} 
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" 
              />
            </svg>
            <span className="hidden sm:inline">Refresh</span>
          </>
        )}
      </div>

      {/* Success animation when cooldown ends */}
      <AnimatePresence>
        {!isOnCooldown && cooldown === 0 && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 0.3, scale: 1.2 }}
            exit={{ opacity: 0, scale: 1.5 }}
            transition={{ duration: 0.5 }}
            className="absolute inset-0 bg-green-400 rounded-lg pointer-events-none"
          />
        )}
      </AnimatePresence>
    </button>
  );
};

export default RefreshButton;