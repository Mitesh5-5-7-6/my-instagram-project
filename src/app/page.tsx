// app/page.tsx
"use client"
import React from 'react';
import InstagramFeed from './components/InstagramFeed';

const InstagramSearchForm: React.FC = () => {

  return (
    <div>
      <InstagramFeed
        username="mitesh_sonagra_"
        postCount={9}
        debug={process.env.NODE_ENV === 'development'}
      />
    </div>
  );
};

export default InstagramSearchForm;
