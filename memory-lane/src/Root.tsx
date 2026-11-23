import React from 'react';
import {Composition} from 'remotion';
import {MemoryLane, MemoryLaneProps} from './MemoryLane';
import {FPS, HEIGHT, WIDTH} from './theme';
import {T} from './timeline';

const defaultProps: MemoryLaneProps = {
  title: 'MEMORY LANE',
  fromYear: 2016,
  toYear: 2026,
  pointer: 'cursor',
};

export const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id="MemoryLane"
      component={MemoryLane}
      durationInFrames={T.duration}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
      defaultProps={defaultProps}
    />
    <Composition
      id="MemoryLaneTouch"
      component={MemoryLane}
      durationInFrames={T.duration}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
      defaultProps={{...defaultProps, pointer: 'touch' as const}}
    />
  </>
);
