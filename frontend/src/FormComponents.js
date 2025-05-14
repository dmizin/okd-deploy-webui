import React, { useState } from "react";

// ValidationTip component to show RFC 1123 pattern info
const ValidationTip = ({ children }) => (
  <span className="validation-tooltip">
    <i className="bi bi-info-circle"></i>
    <div className="tooltip-content">
      {children}
    </div>
  </span>
);

// Resource name validation pattern info component
export const ResourceNameTip = () => (
  <ValidationTip>
    <p style={{ marginTop: 0 }}>Valid resource names must:</p>
    <ul>
      <li>Contain only lowercase alphanumeric characters, '-' or '.'</li>
      <li>Start with an alphanumeric character</li>
      <li>End with an alphanumeric character</li>
      <li>Not exceed 253 characters</li>
    </ul>
    <p style={{ marginBottom: 0 }}>
      Example: my-app, web.app, frontend-api
    </p>
  </ValidationTip>
);

// ValidationSummary component to show all form errors
export const ValidationSummary = ({ errors }) => {
  if (!errors || Object.keys(errors).length === 0) return null;

  return (
    <div className="validation-summary">
      <h4>Please fix the following errors:</h4>
      <ul>
        {Object.entries(errors).map(([key, value]) => (
          <li key={key}>{value}</li>
        ))}
      </ul>
    </div>
  );
};

// RFC 1123 subdomain validation pattern
const RFC1123_PATTERN = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?(\.[a-z0-9]([-a-z0-9]*[a-z0-9])?)*$/;

// Function to validate resource names according to RFC 1123
const validateResourceName = (name) => {
  if (!name) return true; // Empty is valid during typing, will be caught by required
  return RFC1123_PATTERN.test(name);
};

// FormField component with built-in validation
export const FormField = ({
  label,
  type = "text",
  value,
  onChange,
  placeholder,
  required = false,
  validatePattern = null,
  errorMessage = "Invalid format",
  showValidationTip = false,
  onBlur = () => {},
  ...props
}) => {
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState("");

  const handleChange = (e) => {
    const newValue = e.target.value;
    onChange(newValue);

    // Don't show validation errors while typing
    // We'll validate on blur instead
  };

  const validate = (value) => {
    // Don't show validation errors for empty fields (that will be handled by required)
    if (validatePattern && value && !validatePattern.test(value)) {
      setError(errorMessage);
      return false;
    } else {
      setError("");
      return true;
    }
  };

  const handleBlur = (e) => {
    setTouched(true);
    if (validatePattern) {
      validate(e.target.value);
    }
    onBlur(e);
  };

  return (
    <div className="form-group">
      <label>
        {label} {required && <span style={{ color: 'red' }}>*</span>}
        {showValidationTip && <ResourceNameTip />}
      </label>
      <input
        type={type}
        value={value}
        onChange={handleChange}
        onBlur={handleBlur}
        placeholder={placeholder}
        required={required}
        className={error && touched ? "input-error" : ""}
        {...props}
      />
      {error && touched && <div className="error-message">{error}</div>}
    </div>
  );
};

// TextareaField component
export const TextareaField = ({
  label,
  value,
  onChange,
  placeholder,
  required = false,
  rows = 4,
  onBlur = () => {},
  ...props
}) => {
  return (
    <div className="form-group">
      <label>{label} {required && <span style={{ color: 'red' }}>*</span>}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
        required={required}
        rows={rows}
        {...props}
      />
    </div>
  );
};

// SelectField component
export const SelectField = ({
  label,
  value,
  onChange,
  options = [],
  required = false,
  emptyOption = null,
  onBlur = () => {},
  ...props
}) => {
  return (
    <div className="form-group">
      <label>{label} {required && <span style={{ color: 'red' }}>*</span>}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        required={required}
        {...props}
      >
        {emptyOption && <option value="">{emptyOption}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
};

// ValidatedNameInput - A specialized input for resource names with deferred validation
export const ValidatedNameInput = ({
  label,
  value,
  onChange,
  onValidate,
  placeholder,
  required = false,
  validateOnBlur = true, // Added flag to control when validation happens
  ...props
}) => {
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState("");

  const handleChange = (e) => {
    const newValue = e.target.value;
    onChange(newValue);
    // Clear errors during typing to provide better feedback
    if (error) setError("");
  };

  const handleBlur = (e) => {
    if (!validateOnBlur) return; // Skip validation on blur if disabled

    setTouched(true);
    const newValue = e.target.value;

    // Skip validation for empty non-required fields
    if (!newValue && !required) {
      setError("");
      if (onValidate) onValidate(true);
      return;
    }

    // Don't show errors for empty values - that's handled by required attribute
    if (newValue && newValue.trim() !== "") {
      // Only show validation error if value is complete (not being edited)
      // and doesn't match the pattern
      const isValid = RFC1123_PATTERN.test(newValue);
      if (!isValid) {
        setError("Invalid name. Must be lowercase alphanumeric characters, '-' or '.', and must start and end with an alphanumeric character.");
        if (onValidate) onValidate(false, newValue);
      } else {
        setError("");
        if (onValidate) onValidate(true, newValue);
      }
    }
  };

  return (
    <div className="form-group">
      {label && (
        <label>
          {label} {required && <span style={{ color: 'red' }}>*</span>}
          <ResourceNameTip />
        </label>
      )}
      <input
        type="text"
        value={value}
        onChange={handleChange}
        onBlur={handleBlur}
        placeholder={placeholder}
        required={required}
        className={error && touched ? "input-error" : ""}
        {...props}
      />
      {error && touched && <div className="error-message">{error}</div>}
    </div>
  );
};

export default {
  FormField,
  TextareaField,
  SelectField,
  ValidationSummary,
  ResourceNameTip,
  ValidatedNameInput
};
