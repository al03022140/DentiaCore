import React from 'react';
import PropTypes from 'prop-types';

const SectionHeader = ({ title, id }) => <h2 id={id}>{title}</h2>;

SectionHeader.propTypes = {
  title: PropTypes.string.isRequired,
  id: PropTypes.string.isRequired
};

export default React.memo(SectionHeader); 