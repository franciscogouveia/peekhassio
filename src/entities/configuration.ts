import { upsertGroup } from '../groups/configuration.js';
import {
    type ConfigurationV1,
    type EntityConfiguration,
    assertValidConfiguration,
} from '../shared/configuration.js';

export function upsertEntity(
    configuration: ConfigurationV1,
    groupId: string,
    previousEntityId: string | null,
    entity: EntityConfiguration,
): ConfigurationV1 {
    const group = configuration.groups.find(candidate => candidate.id === groupId);
    assertValidConfiguration(group !== undefined, `group id ${groupId} must exist`);
    const existingIndex = previousEntityId === null
        ? -1
        : group.entities.findIndex(candidate => candidate.entityId === previousEntityId);
    assertValidConfiguration(previousEntityId === null || existingIndex !== -1, `entity id ${previousEntityId} must exist`);
    assertValidConfiguration(!group.entities.some((candidate, index) =>
        candidate.entityId === entity.entityId && index !== existingIndex),
    `entity id ${entity.entityId} must be unique within its group`);
    const normalized = entity.unitOverride?.trim()
        ? { ...entity, unitOverride: entity.unitOverride.trim() }
        : { entityId: entity.entityId };
    const entities = existingIndex === -1
        ? [...group.entities, normalized]
        : group.entities.map((candidate, index) => index === existingIndex ? normalized : candidate);
    return upsertGroup(configuration, { ...group, entities });
}

export function removeEntity(configuration: ConfigurationV1, groupId: string, entityId: string): ConfigurationV1 {
    const group = configuration.groups.find(candidate => candidate.id === groupId);
    assertValidConfiguration(group !== undefined, `group id ${groupId} must exist`);
    assertValidConfiguration(group.entities.some(entity => entity.entityId === entityId), `entity id ${entityId} must exist`);
    return upsertGroup(configuration, {
        ...group,
        entities: group.entities.filter(entity => entity.entityId !== entityId),
    });
}

export function moveEntity(
    configuration: ConfigurationV1,
    groupId: string,
    entityId: string,
    direction: -1 | 1,
): ConfigurationV1 {
    const group = configuration.groups.find(candidate => candidate.id === groupId);
    assertValidConfiguration(group !== undefined, `group id ${groupId} must exist`);
    const currentIndex = group.entities.findIndex(entity => entity.entityId === entityId);
    assertValidConfiguration(currentIndex !== -1, `entity id ${entityId} must exist`);
    const targetIndex = currentIndex + direction;
    assertValidConfiguration(targetIndex >= 0 && targetIndex < group.entities.length, `entity id ${entityId} cannot move further`);
    const entities = [...group.entities];
    [entities[currentIndex], entities[targetIndex]] = [entities[targetIndex]!, entities[currentIndex]!];
    return upsertGroup(configuration, { ...group, entities });
}
