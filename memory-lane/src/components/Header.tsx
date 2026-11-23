import React from 'react';
import {colors, fonts, layout, rgba} from '../theme';

export const Header: React.FC<{title: string; intro: number}> = ({
  title,
  intro,
}) => {
  // Tracking relaxes slightly as the heading fades in.
  const tracking = 0.62 - 0.12 * intro;
  return (
    <div
      style={{
        position: 'absolute',
        top: layout.headerY,
        left: 0,
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        transform: `translateY(-50%) translateY(${(1 - intro) * 8}px)`,
        // Already legible on frame 0 so the Reel's first frame/thumbnail reads.
        opacity: 0.55 + 0.45 * intro,
      }}
    >
      <div
        style={{
          fontFamily: fonts.text,
          fontWeight: 500,
          fontSize: 30,
          letterSpacing: `${tracking}em`,
          // Compensate the trailing letter-space so the word is optically centred.
          paddingLeft: `${tracking}em`,
          color: colors.header,
          whiteSpace: 'nowrap',
        }}
      >
        {title}
      </div>
      <div
        style={{
          marginTop: 26,
          width: 18 + 16 * intro,
          height: 2,
          borderRadius: 1,
          background: rgba(colors.lavender, 0.9),
          boxShadow: `0 0 14px ${rgba(colors.lavenderDeep, 0.8)}`,
        }}
      />
    </div>
  );
};
