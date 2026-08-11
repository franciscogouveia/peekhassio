import { runSafely } from '../shared/action-runner.js';
import type { RuntimeGroupState } from '../runtime/coordinator.js';
import {
    buildPanelGroupViewModels,
    type PanelGroupViewModel,
} from './panel-view-model.js';

export interface PanelGroupWidget {
    update(viewModel: PanelGroupViewModel): void;
    destroy(): void;
}

export interface PanelWidgetFactory {
    create(viewModel: PanelGroupViewModel, position: number): PanelGroupWidget;
}

export function runPanelAction(
    action: () => void,
    closeMenu: () => void,
    failureMessage: string,
    showError: (message: string) => void,
    reportReportingError: () => void,
): void {
    runSafely(
        () => {
            action();
            closeMenu();
        },
        () => showError(failureMessage),
        reportReportingError,
    );
}

export class PanelController {
    readonly #factory: PanelWidgetFactory;
    #ids: string[] = [];
    #widgets: PanelGroupWidget[] = [];

    constructor(factory: PanelWidgetFactory) {
        this.#factory = factory;
    }

    render(groups: RuntimeGroupState[]): void {
        const viewModels = buildPanelGroupViewModels(groups);
        const ids = viewModels.map(viewModel => viewModel.id);
        if (ids.length !== this.#ids.length || ids.some((id, index) => id !== this.#ids[index])) {
            this.destroy();
            this.#ids = ids;
            this.#widgets = viewModels.map((viewModel, index) => this.#factory.create(viewModel, index));
            return;
        }
        viewModels.forEach((viewModel, index) => this.#widgets[index]!.update(viewModel));
    }

    destroy(): void {
        this.#widgets.forEach(widget => widget.destroy());
        this.#widgets = [];
        this.#ids = [];
    }
}
