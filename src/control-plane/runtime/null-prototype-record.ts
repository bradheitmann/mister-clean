/** Build an internal composition record with only the supplied own fields. */
export function nullPrototypeRecord<Value extends object>(fields: Value): Value {
  return Object.assign(Object.create(null) as object, fields) as Value;
}
