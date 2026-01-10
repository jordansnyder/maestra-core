export { RangeControl } from './RangeControl'
export { NumberControl } from './NumberControl'
export { BooleanControl } from './BooleanControl'
export { StringControl } from './StringControl'
export { ColorControl } from './ColorControl'
export { EnumControl } from './EnumControl'
export { VectorControl } from './VectorControl'
export { JsonControl } from './JsonControl'

import type { VariableType } from '@/lib/types'

export function getControlComponent(type: VariableType) {
  switch (type) {
    case 'range':
      return 'RangeControl'
    case 'number':
      return 'NumberControl'
    case 'boolean':
      return 'BooleanControl'
    case 'string':
      return 'StringControl'
    case 'color':
      return 'ColorControl'
    case 'enum':
      return 'EnumControl'
    case 'vector2':
    case 'vector3':
      return 'VectorControl'
    case 'array':
    case 'object':
      return 'JsonControl'
    default:
      return 'StringControl'
  }
}
