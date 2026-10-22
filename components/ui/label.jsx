function Label({ className = "", ...props }) {
  return (
    <label
      className={`text-sm font-medium leading-none text-foreground ${className}`}
      {...props}
    />
  );
}

export { Label };
