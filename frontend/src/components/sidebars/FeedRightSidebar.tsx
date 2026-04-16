import React from 'react'
import SuggestionsWidget from './SuggestionsWidget'
import JobsWidget from './JobsWidget'
import CoursesWidget from './CoursesWidget'

const FeedRightSidebar: React.FC = () => (
  <>
    <SuggestionsWidget />
    <JobsWidget />
    <CoursesWidget />
  </>
)

export default FeedRightSidebar
