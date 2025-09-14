import React from 'react';

export default function SkeletonCards({ count = 6 }: { count?: number }) {
  return (
    <div className="cards">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card skel" aria-hidden="true">
          <div className="skel-line w80" />
          <div className="skel-line w60" />
        </div>
      ))}
    </div>
  );
}
