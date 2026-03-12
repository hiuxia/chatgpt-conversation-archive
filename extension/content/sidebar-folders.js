(function () {
  const ns = globalThis.__chatgptConversationArchiveContent;

  if (!ns || ns.sidebarFoldersLoaded) {
    return;
  }
  ns.sidebarFoldersLoaded = true;

  ns.initializeSidebarFolderController = function initializeSidebarFolderController() {
    if (!ns.sidebarFolderController) {
      ns.sidebarFolderController = ns.createSidebarFolderController();
    }
    ns.sidebarFolderController.start();
  };

  ns.createSidebarFolderController = function createSidebarFolderController() {
    return {
      state: null,
      observer: null,
      observedNav: null,
      renderTimer: null,
      observerResumeTimer: null,
      started: false,
      isRendering: false,
      ignoreObservedMutations: false,
      dragConversationId: "",
      dragFolderId: "",
      dragTargetKey: "",
      visibleConversationSignature: "",
      isCreatingFolder: false,
      createParentFolderId: null,
      createDraft: "",
      openMenuFolderId: "",
      renamingFolderId: "",
      renameDraft: "",
      pendingDeleteFolderId: "",
      handleDocumentPointerDown: null,
      handleDocumentKeyDown: null,

      start() {
        if (this.started) return;
        this.started = true;
        ns.ensureSidebarFolderStyles();
        this.attachDocumentListeners();
        this.refreshState();
        this.attachNavigationWatcher();
      },

      attachDocumentListeners() {
        if (!this.handleDocumentPointerDown) {
          this.handleDocumentPointerDown = (event) => {
            if (!this.openMenuFolderId) return;
            if (ns.eventTargetsFolderMenu(event)) return;
            this.closeFolderMenu();
          };
          document.addEventListener("pointerdown", this.handleDocumentPointerDown, true);
        }

        if (!this.handleDocumentKeyDown) {
          this.handleDocumentKeyDown = (event) => {
            if (event.key !== "Escape") return;
            if (this.openMenuFolderId) {
              event.preventDefault();
              this.closeFolderMenu();
            }
          };
          document.addEventListener("keydown", this.handleDocumentKeyDown, true);
        }
      },

      async refreshState() {
        const response = await ns.sendRuntimeMessage({
          type: ns.MESSAGE_TYPES.GET_SIDEBAR_FOLDER_STATE
        });
        if (!response?.ok || !response?.state) {
          this.scheduleRender(800);
          return;
        }

        this.state = response.state;
        this.scheduleRender(0);
      },

      attachNavigationWatcher() {
        const nav = ns.querySidebarNav();
        if (!nav) {
          this.scheduleRender(500);
          return;
        }

        if (this.observedNav === nav) {
          return;
        }

        if (this.observer) {
          this.observer.disconnect();
        }

        this.observer = new MutationObserver(() => {
          if (this.isRendering || this.ignoreObservedMutations) return;
          this.scheduleRender(60);
        });

        this.observer.observe(nav, {
          childList: true,
          subtree: true
        });

        this.observedNav = nav;
      },

      scheduleRender(delayMs) {
        if (this.renderTimer) {
          clearTimeout(this.renderTimer);
        }

        this.renderTimer = setTimeout(() => {
          this.renderTimer = null;
          this.render().catch((error) => {
            console.warn("Sidebar folder render failed:", error);
            this.scheduleRender(800);
          });
        }, delayMs);
      },

      async render() {
        this.attachNavigationWatcher();
        this.attachDocumentListeners();
        if (!this.state) {
          await this.refreshState();
          return;
        }

        const nav = ns.querySidebarNav();
        const historyContainer = document.getElementById("history");
        const yourChatsSection = historyContainer?.parentElement;
        if (!nav || !historyContainer || !yourChatsSection) {
          this.scheduleRender(500);
          return;
        }

        this.isRendering = true;
        this.ignoreObservedMutations = true;
        if (this.observerResumeTimer) {
          clearTimeout(this.observerResumeTimer);
          this.observerResumeTimer = null;
        }
        try {
          const foldersSection = ns.ensureFoldersSection(nav, yourChatsSection);
          ns.restoreManagedSidebarChats({
            section: foldersSection,
            historyContainer
          });
          const folderContainers = ns.renderFoldersSection({
            controller: this,
            state: this.state,
            section: foldersSection
          });
          ns.removeManagedCachedSidebarChats(nav);
          ns.decorateUnassignedSection({
            controller: this,
            yourChatsSection,
            historyContainer
          });
          ns.redistributeSidebarChats({
            controller: this,
            nav,
            historyContainer,
            folderContainers,
            state: this.state
          });
          void this.syncVisibleConversationCatalog(nav);
        } finally {
          this.isRendering = false;
          this.observerResumeTimer = setTimeout(() => {
            this.ignoreObservedMutations = false;
            this.observerResumeTimer = null;
          }, 120);
        }
      },

      async syncVisibleConversationCatalog(nav) {
        const items = ns.collectVisibleNativeConversationItems(nav);
        if (!items.length) return;

        const signature = items
          .map((item) => `${item.id}|${item.title}|${item.url}`)
          .join("\n");
        if (signature === this.visibleConversationSignature) {
          return;
        }

        this.visibleConversationSignature = signature;
        const response = await ns.sendRuntimeMessage({
          type: ns.MESSAGE_TYPES.UPSERT_SIDEBAR_CONVERSATIONS,
          items,
          source: "history"
        });
        if (response?.ok && response.state) {
          this.state = response.state;
        }
      },

      beginCreateFolder(parentFolderId = null) {
        this.isCreatingFolder = true;
        this.createParentFolderId = parentFolderId || null;
        this.createDraft = "";
        this.openMenuFolderId = "";
        this.renamingFolderId = "";
        this.pendingDeleteFolderId = "";
        this.scheduleRender(0);
      },

      cancelCreateFolder() {
        this.isCreatingFolder = false;
        this.createParentFolderId = null;
        this.createDraft = "";
        this.scheduleRender(0);
      },

      updateCreateDraft(value) {
        this.createDraft = String(value || "");
      },

      async submitCreateFolder() {
        const response = await ns.sendRuntimeMessage({
          type: ns.MESSAGE_TYPES.CREATE_SIDEBAR_FOLDER,
          name: this.createDraft,
          parentFolderId: this.createParentFolderId
        });
        if (!response?.ok || !response?.state) {
          window.alert(response?.error || "Could not create folder.");
          return;
        }
        this.state = response.state;
        this.isCreatingFolder = false;
        this.createParentFolderId = null;
        this.createDraft = "";
        this.scheduleRender(0);
      },

      async toggleSectionExpanded() {
        if (!this.state) return;
        const expanded = this.state?.ui?.sectionExpanded === false;
        this.state = {
          ...this.state,
          ui: {
            ...(this.state.ui || {}),
            sectionExpanded: expanded
          }
        };
        this.scheduleRender(0);

        const response = await ns.sendRuntimeMessage({
          type: ns.MESSAGE_TYPES.SET_SIDEBAR_SECTION_EXPANDED,
          expanded
        });
        if (!response?.ok || !response?.state) {
          this.state = {
            ...this.state,
            ui: {
              ...(this.state.ui || {}),
              sectionExpanded: !expanded
            }
          };
          this.scheduleRender(0);
          return;
        }
        this.state = response.state;
        this.scheduleRender(0);
      },

      async toggleFolderExpanded(folderId, event) {
        if (event) {
          event.preventDefault();
          event.stopPropagation();
        }

        const folder = this.state?.folders?.find((item) => item.id === folderId);
        if (!folder) return;
        const expanded = folder.expanded === false;

        this.state = {
          ...this.state,
          folders: (this.state.folders || []).map((item) =>
            item.id === folderId ? { ...item, expanded } : item
          )
        };
        this.scheduleRender(0);

        const response = await ns.sendRuntimeMessage({
          type: ns.MESSAGE_TYPES.SET_SIDEBAR_FOLDER_EXPANDED,
          folderId,
          expanded
        });
        if (!response?.ok || !response?.state) {
          this.state = {
            ...this.state,
            folders: (this.state.folders || []).map((item) =>
              item.id === folderId ? { ...item, expanded: folder.expanded !== false } : item
            )
          };
          this.scheduleRender(0);
          return;
        }
        this.state = response.state;
        this.scheduleRender(0);
      },

      toggleFolderMenu(folderId, event) {
        event.preventDefault();
        event.stopPropagation();

        const folder = this.state?.folders?.find((item) => item.id === folderId);
        if (!folder) return;

        const nextFolderId = this.openMenuFolderId === folderId ? "" : folderId;
        this.openMenuFolderId = nextFolderId;
        this.renamingFolderId = "";
        this.renameDraft = "";
        this.pendingDeleteFolderId = "";
        this.scheduleRender(0);
      },

      closeFolderMenu() {
        if (!this.openMenuFolderId && !this.renamingFolderId && !this.pendingDeleteFolderId) {
          return;
        }
        this.openMenuFolderId = "";
        this.renamingFolderId = "";
        this.renameDraft = "";
        this.pendingDeleteFolderId = "";
        this.scheduleRender(0);
      },

      beginRenameFolder(folderId, event) {
        if (event) {
          event.preventDefault();
          event.stopPropagation();
        }

        const folder = this.state?.folders?.find((item) => item.id === folderId);
        if (!folder) return;

        this.openMenuFolderId = folderId;
        this.renamingFolderId = folderId;
        this.pendingDeleteFolderId = "";
        this.renameDraft = folder.name;
        this.scheduleRender(0);
      },

      updateRenameDraft(value) {
        this.renameDraft = String(value || "");
      },

      cancelRenameFolder() {
        this.openMenuFolderId = this.renamingFolderId || this.openMenuFolderId;
        this.renamingFolderId = "";
        this.renameDraft = "";
        this.scheduleRender(0);
      },

      async submitRenameFolder(folderId) {
        const renameResponse = await ns.sendRuntimeMessage({
          type: ns.MESSAGE_TYPES.RENAME_SIDEBAR_FOLDER,
          folderId,
          name: this.renameDraft
        });
        if (!renameResponse?.ok || !renameResponse?.state) {
          window.alert(renameResponse?.error || "Could not rename folder.");
          return;
        }

        this.state = renameResponse.state;
        this.openMenuFolderId = "";
        this.renamingFolderId = "";
        this.renameDraft = "";
        this.pendingDeleteFolderId = "";
        this.scheduleRender(0);
      },

      requestDeleteFolder(folderId, event) {
        if (event) {
          event.preventDefault();
          event.stopPropagation();
        }

        this.openMenuFolderId = folderId;
        this.renamingFolderId = "";
        this.pendingDeleteFolderId = folderId;
        this.scheduleRender(0);
      },

      cancelDeleteFolder() {
        this.pendingDeleteFolderId = "";
        this.scheduleRender(0);
      },

      async submitDeleteFolder(folderId) {
        const deleteResponse = await ns.sendRuntimeMessage({
          type: ns.MESSAGE_TYPES.DELETE_SIDEBAR_FOLDER,
          folderId
        });
        if (!deleteResponse?.ok || !deleteResponse?.state) {
          window.alert(deleteResponse?.error || "Could not delete folder.");
          return;
        }

        this.state = deleteResponse.state;
        this.openMenuFolderId = "";
        this.renamingFolderId = "";
        this.renameDraft = "";
        this.pendingDeleteFolderId = "";
        this.scheduleRender(0);
      },

      handleDragStart(anchor, event) {
        const conversationId = ns.getConversationIdFromHref(anchor.getAttribute("href") || "");
        if (!conversationId) return;

        this.dragConversationId = conversationId;
        this.dragFolderId = "";
        this.dragTargetKey = "";
        anchor.classList.add(ns.SIDEBAR_FOLDER_CLASSES.dragging);
        if (event.dataTransfer) {
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", conversationId);
        }
      },

      handleDragEnd(anchor) {
        anchor.classList.remove(ns.SIDEBAR_FOLDER_CLASSES.dragging);
        this.dragConversationId = "";
        this.setDragTarget("");
      },

      handleFolderDragStart(element, event) {
        const folderId = String(element?.dataset?.folderId || "").trim();
        if (!folderId) return;

        this.dragFolderId = folderId;
        this.dragConversationId = "";
        this.dragTargetKey = "";
        if (event.dataTransfer) {
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", folderId);
        }
      },

      handleFolderDragEnd() {
        this.dragFolderId = "";
        this.setDragTarget("");
      },

      setDragTarget(targetKey) {
        if (this.dragTargetKey === targetKey) {
          return;
        }

        for (const prev of document.querySelectorAll(`[data-cgca-drop-key="${this.dragTargetKey}"]`)) {
          prev.classList.remove(ns.SIDEBAR_FOLDER_CLASSES.folderRowDropTarget);
          prev.classList.remove(ns.SIDEBAR_FOLDER_CLASSES.folderChildrenDropTarget);
          prev.classList.remove(ns.SIDEBAR_FOLDER_CLASSES.unassignedDropTarget);
        }

        this.dragTargetKey = targetKey;
        for (const next of document.querySelectorAll(`[data-cgca-drop-key="${targetKey}"]`)) {
          if (targetKey === "unassigned") {
            next.classList.add(ns.SIDEBAR_FOLDER_CLASSES.unassignedDropTarget);
            continue;
          }

          if (targetKey.endsWith(":children")) {
            next.classList.add(ns.SIDEBAR_FOLDER_CLASSES.folderChildrenDropTarget);
            continue;
          }

          next.classList.add(ns.SIDEBAR_FOLDER_CLASSES.folderRowDropTarget);
        }
      },

      async assignDraggedConversation(folderId) {
        const conversationId = this.dragConversationId;
        if (!conversationId || !folderId) return;
        const anchor = ns.findConversationAnchor(conversationId);

        const response = await ns.sendRuntimeMessage({
          type: ns.MESSAGE_TYPES.ASSIGN_SIDEBAR_CONVERSATION,
          conversationId,
          folderId,
          title: ns.getConversationTitleFromAnchor(anchor),
          url: ns.getConversationAbsoluteUrl(anchor)
        });

        if (!response?.ok || !response?.state) {
          window.alert(response?.error || "Could not move chat into folder.");
          return;
        }

        this.state = response.state;
        this.dragConversationId = "";
        this.setDragTarget("");
        this.scheduleRender(0);
      },

      async moveDraggedFolder(parentFolderId) {
        const folderId = this.dragFolderId;
        if (!folderId) return;

        const response = await ns.sendRuntimeMessage({
          type: ns.MESSAGE_TYPES.MOVE_SIDEBAR_FOLDER,
          folderId,
          parentFolderId: parentFolderId || null
        });

        if (!response?.ok || !response?.state) {
          window.alert(response?.error || "Could not move folder.");
          return;
        }

        this.state = response.state;
        this.dragFolderId = "";
        this.setDragTarget("");
        this.scheduleRender(0);
      },

      async clearDraggedConversationFolder() {
        const conversationId = this.dragConversationId;
        if (!conversationId && !this.dragFolderId) return;

        if (this.dragFolderId) {
          await this.moveDraggedFolder(null);
          return;
        }

        const response = await ns.sendRuntimeMessage({
          type: ns.MESSAGE_TYPES.CLEAR_SIDEBAR_CONVERSATION,
          conversationId
        });

        if (!response?.ok || !response?.state) {
          window.alert(response?.error || "Could not move chat back to Your chats.");
          return;
        }

        this.state = response.state;
        this.dragConversationId = "";
        this.setDragTarget("");
        this.scheduleRender(0);
      }
    };
  };

  ns.querySidebarNav = function querySidebarNav() {
    return ns.findFirstByFallbackSelectors(document, ns.SELECTOR_MAP.sidebarNav);
  };

  ns.eventTargetsFolderMenu = function eventTargetsFolderMenu(event) {
    const target = event?.target;
    if (!(target instanceof Element)) {
      return false;
    }

    return Boolean(
      target.closest(`.${ns.SIDEBAR_FOLDER_CLASSES.menuPanel}`) ||
        target.closest(`.${ns.SIDEBAR_FOLDER_CLASSES.menuButton}`)
    );
  };

  ns.ensureFoldersSection = function ensureFoldersSection(nav, yourChatsSection) {
    let section = nav.querySelector(`.${ns.SIDEBAR_FOLDER_CLASSES.section}`);
    if (!section) {
      section = document.createElement("div");
      section.className = `group/sidebar-expando-section mb-[var(--sidebar-expanded-section-margin-bottom)] ${ns.SIDEBAR_FOLDER_CLASSES.section}`;
    }

    if (section.parentElement !== nav) {
      nav.insertBefore(section, yourChatsSection);
    } else if (section.nextElementSibling !== yourChatsSection) {
      nav.insertBefore(section, yourChatsSection);
    }

    return section;
  };

  ns.restoreManagedSidebarChats = function restoreManagedSidebarChats({ section, historyContainer }) {
    if (!section || !historyContainer) return;

    const managedAnchors = Array.from(
      section.querySelectorAll('a[data-sidebar-item="true"][href*="/c/"]')
    );
    for (const anchor of managedAnchors) {
      historyContainer.appendChild(anchor);
    }
  };

  ns.removeManagedCachedSidebarChats = function removeManagedCachedSidebarChats(root) {
    if (!root) return;
    for (const cachedRow of root.querySelectorAll(`[data-cgca-cached="true"]`)) {
      cachedRow.remove();
    }
  };

  ns.renderFoldersSection = function renderFoldersSection({ controller, state, section }) {
    section.textContent = "";
    const tree = ns.buildFolderTree(state?.folders || []);

    const headerButton = document.createElement("button");
    headerButton.type = "button";
    headerButton.className = `text-token-text-tertiary flex w-full items-center justify-start gap-0.5 px-4 py-1.5 ${ns.SIDEBAR_FOLDER_CLASSES.headerButton}`;
    headerButton.setAttribute("aria-expanded", state?.ui?.sectionExpanded === false ? "false" : "true");
    headerButton.addEventListener("click", () => controller.toggleSectionExpanded());

    const headerLabel = document.createElement("h2");
    headerLabel.className = "__menu-label";
    headerLabel.dataset.noSpacing = "true";
    headerLabel.textContent = "Folders";
    headerButton.appendChild(headerLabel);
    headerButton.appendChild(ns.createSectionChevron(state?.ui?.sectionExpanded !== false));
    section.appendChild(headerButton);

    if (state?.ui?.sectionExpanded === false) {
      return new Map();
    }

    if (controller.isCreatingFolder && !controller.createParentFolderId) {
      section.appendChild(ns.createFolderCreateForm(controller));
    } else {
      const createButton = document.createElement("button");
      createButton.type = "button";
      createButton.className = `group __menu-item hoverable gap-1.5 w-full ${ns.SIDEBAR_FOLDER_CLASSES.createButton}`;
      createButton.dataset.sidebarItem = "true";
      createButton.addEventListener("click", () => controller.beginCreateFolder());
      createButton.appendChild(ns.createMenuIcon(ns.createPlusGlyph()));
      createButton.appendChild(ns.createGrowLabel("New folder", ns.SIDEBAR_FOLDER_CLASSES.createLabel));
      section.appendChild(createButton);
    }

    const folderContainers = new Map();
    for (const rootFolder of tree.roots) {
      ns.renderFolderNode({
        controller,
        state,
        tree,
        folder: rootFolder,
        parentElement: section,
        folderContainers
      });
    }

    return folderContainers;
  };

  ns.createFolderCreateForm = function createFolderCreateForm(controller) {
    const createForm = document.createElement("form");
    createForm.className = ns.SIDEBAR_FOLDER_CLASSES.createForm;
    createForm.addEventListener("submit", (event) => {
      event.preventDefault();
      controller.submitCreateFolder();
    });

    const input = document.createElement("input");
    input.className = ns.SIDEBAR_FOLDER_CLASSES.createInput;
    input.type = "text";
    input.name = "folder-name";
    input.placeholder = "Folder name";
    input.value = controller.createDraft;
    input.addEventListener("input", (event) => controller.updateCreateDraft(event.target.value));
    input.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        controller.cancelCreateFolder();
      }
    });
    createForm.appendChild(input);

    const submit = document.createElement("button");
    submit.type = "submit";
    submit.className = ns.SIDEBAR_FOLDER_CLASSES.createSubmit;
    submit.textContent = "Add";
    createForm.appendChild(submit);

    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = ns.SIDEBAR_FOLDER_CLASSES.createCancel;
    cancel.textContent = "Cancel";
    cancel.addEventListener("click", () => controller.cancelCreateFolder());
    createForm.appendChild(cancel);

    setTimeout(() => input.focus(), 0);
    return createForm;
  };

  ns.renderFolderNode = function renderFolderNode({
    controller,
    state,
    tree,
    folder,
    parentElement,
    folderContainers
  }) {
    const block = document.createElement("div");
    block.className = ns.SIDEBAR_FOLDER_CLASSES.folderBlock;
    block.dataset.folderId = folder.id;

    const row = document.createElement("div");
    row.className = `group __menu-item hoverable ${ns.SIDEBAR_FOLDER_CLASSES.folderRow}`;
    if (folder.expanded !== false) {
      row.classList.add(ns.SIDEBAR_FOLDER_CLASSES.folderRowExpanded);
    }
    row.dataset.sidebarItem = "true";
    row.dataset.folderId = folder.id;
    row.dataset.cgcaDropKey = folder.id;
    row.setAttribute("aria-expanded", folder.expanded === false ? "false" : "true");
    row.draggable = true;
    row.addEventListener("dragstart", (event) => controller.handleFolderDragStart(row, event));
    row.addEventListener("dragend", () => controller.handleFolderDragEnd());
    ns.bindFolderDropTarget({
      controller,
      element: row,
      folderId: folder.id,
      targetKey: folder.id
    });

    const toggleButton = document.createElement("button");
    toggleButton.type = "button";
    toggleButton.className = ns.SIDEBAR_FOLDER_CLASSES.folderToggleButton;
    toggleButton.setAttribute("aria-expanded", folder.expanded === false ? "false" : "true");
    toggleButton.addEventListener("click", (event) =>
      controller.toggleFolderExpanded(folder.id, event)
    );

    const rowBody = document.createElement("div");
    rowBody.className = `flex min-w-0 grow items-center gap-1.5 ${ns.SIDEBAR_FOLDER_CLASSES.folderRowBody}`;
    rowBody.appendChild(ns.createFolderToggleIcon(folder.expanded !== false));
    rowBody.appendChild(ns.createMenuIcon(ns.createFolderGlyph()));
    rowBody.appendChild(ns.createGrowLabel(folder.name));
    toggleButton.appendChild(rowBody);
    row.appendChild(toggleButton);

    const trailingPair = document.createElement("div");
    trailingPair.className = ns.SIDEBAR_FOLDER_CLASSES.folderTrailing;

    const count = document.createElement("div");
    count.className = ns.SIDEBAR_FOLDER_CLASSES.count;
    count.textContent = String(ns.countAssignedChats(state, tree, folder.id));
    trailingPair.appendChild(count);

    const menuWrap = document.createElement("div");
    menuWrap.className = ns.SIDEBAR_FOLDER_CLASSES.menuWrap;
    const menuButton = document.createElement("button");
    menuButton.type = "button";
    menuButton.className = ns.SIDEBAR_FOLDER_CLASSES.menuButton;
    menuButton.setAttribute("aria-label", `Folder options for ${folder.name}`);
    menuButton.setAttribute(
      "aria-expanded",
      controller.openMenuFolderId === folder.id ? "true" : "false"
    );
    menuButton.addEventListener("click", (event) => controller.toggleFolderMenu(folder.id, event));
    menuButton.appendChild(ns.createMoreGlyph());
    menuWrap.appendChild(menuButton);
    trailingPair.appendChild(menuWrap);
    row.appendChild(trailingPair);
    block.appendChild(row);

    if (controller.openMenuFolderId === folder.id) {
      const menuPanel = document.createElement("div");
      menuPanel.className = ns.SIDEBAR_FOLDER_CLASSES.menuPanel;

      if (controller.renamingFolderId === folder.id) {
        const renameForm = document.createElement("form");
        renameForm.className = ns.SIDEBAR_FOLDER_CLASSES.renameForm;
        renameForm.addEventListener("submit", (event) => {
          event.preventDefault();
          controller.submitRenameFolder(folder.id);
        });

        const renameInput = document.createElement("input");
        renameInput.className = ns.SIDEBAR_FOLDER_CLASSES.renameInput;
        renameInput.type = "text";
        renameInput.name = "rename-folder";
        renameInput.value = controller.renameDraft;
        renameInput.placeholder = "Folder name";
        renameInput.addEventListener("input", (event) =>
          controller.updateRenameDraft(event.target.value)
        );
        renameInput.addEventListener("keydown", (event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            controller.cancelRenameFolder();
          }
        });
        renameForm.appendChild(renameInput);

        const renameActions = document.createElement("div");
        renameActions.className = [
          ns.SIDEBAR_FOLDER_CLASSES.menuActions,
          ns.SIDEBAR_FOLDER_CLASSES.menuActionsInline
        ].join(" ");

        const renameSubmit = document.createElement("button");
        renameSubmit.type = "submit";
        renameSubmit.className = ns.SIDEBAR_FOLDER_CLASSES.menuAction;
        renameSubmit.textContent = "Save";
        renameActions.appendChild(renameSubmit);

        const renameCancel = document.createElement("button");
        renameCancel.type = "button";
        renameCancel.className = ns.SIDEBAR_FOLDER_CLASSES.menuAction;
        renameCancel.textContent = "Cancel";
        renameCancel.addEventListener("click", () => controller.cancelRenameFolder());
        renameActions.appendChild(renameCancel);

        renameForm.appendChild(renameActions);
        menuPanel.appendChild(renameForm);
        setTimeout(() => renameInput.focus(), 0);
      } else if (controller.pendingDeleteFolderId === folder.id) {
        const notice = document.createElement("div");
        notice.className = ns.SIDEBAR_FOLDER_CLASSES.menuNotice;
        notice.textContent = `Delete "${folder.name}"? Child folders move up one level.`;
        menuPanel.appendChild(notice);

        const actions = document.createElement("div");
        actions.className = [
          ns.SIDEBAR_FOLDER_CLASSES.menuActions,
          ns.SIDEBAR_FOLDER_CLASSES.menuActionsInline
        ].join(" ");

        const confirmDelete = document.createElement("button");
        confirmDelete.type = "button";
        confirmDelete.className = [
          ns.SIDEBAR_FOLDER_CLASSES.menuAction,
          ns.SIDEBAR_FOLDER_CLASSES.menuActionDanger
        ].join(" ");
        confirmDelete.textContent = "Delete";
        confirmDelete.addEventListener("click", () => controller.submitDeleteFolder(folder.id));
        actions.appendChild(confirmDelete);

        const cancelDelete = document.createElement("button");
        cancelDelete.type = "button";
        cancelDelete.className = ns.SIDEBAR_FOLDER_CLASSES.menuAction;
        cancelDelete.textContent = "Cancel";
        cancelDelete.addEventListener("click", () => controller.cancelDeleteFolder());
        actions.appendChild(cancelDelete);

        menuPanel.appendChild(actions);
      } else {
        const actions = document.createElement("div");
        actions.className = ns.SIDEBAR_FOLDER_CLASSES.menuActions;

        const createAction = document.createElement("button");
        createAction.type = "button";
        createAction.className = ns.SIDEBAR_FOLDER_CLASSES.menuAction;
        createAction.textContent = "New subfolder";
        createAction.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          controller.beginCreateFolder(folder.id);
        });
        actions.appendChild(createAction);

        const renameAction = document.createElement("button");
        renameAction.type = "button";
        renameAction.className = ns.SIDEBAR_FOLDER_CLASSES.menuAction;
        renameAction.textContent = "Rename";
        renameAction.addEventListener("click", (event) =>
          controller.beginRenameFolder(folder.id, event)
        );
        actions.appendChild(renameAction);

        const deleteAction = document.createElement("button");
        deleteAction.type = "button";
        deleteAction.className = [
          ns.SIDEBAR_FOLDER_CLASSES.menuAction,
          ns.SIDEBAR_FOLDER_CLASSES.menuActionDanger
        ].join(" ");
        deleteAction.textContent = "Delete";
        deleteAction.addEventListener("click", (event) =>
          controller.requestDeleteFolder(folder.id, event)
        );
        actions.appendChild(deleteAction);

        menuPanel.appendChild(actions);
      }

      menuWrap.appendChild(menuPanel);
    }

    const children = document.createElement("div");
    children.className = ns.SIDEBAR_FOLDER_CLASSES.folderChildren;
    children.dataset.folderId = folder.id;
    children.dataset.cgcaDropKey = `${folder.id}:children`;
    if (folder.expanded === false) {
      children.hidden = true;
    }
    ns.bindFolderDropTarget({
      controller,
      element: children,
      folderId: folder.id,
      targetKey: `${folder.id}:children`
    });

    if (controller.isCreatingFolder && controller.createParentFolderId === folder.id) {
      children.appendChild(ns.createFolderCreateForm(controller));
    }

    for (const childFolder of tree.childrenById.get(folder.id) || []) {
      ns.renderFolderNode({
        controller,
        state,
        tree,
        folder: childFolder,
        parentElement: children,
        folderContainers
      });
    }

    const emptyState = document.createElement("div");
    emptyState.className = ns.SIDEBAR_FOLDER_CLASSES.emptyState;
    emptyState.textContent = "Drop chats here";
    children.appendChild(emptyState);
    block.appendChild(children);

    parentElement.appendChild(block);
    folderContainers.set(folder.id, children);
  };

  ns.decorateUnassignedSection = function decorateUnassignedSection({
    controller,
    yourChatsSection,
    historyContainer
  }) {
    yourChatsSection.dataset.cgcaDropKey = "unassigned";
    ns.bindUnassignedDropTarget(controller, yourChatsSection);
    historyContainer.dataset.cgcaDropKey = "unassigned";
    ns.bindUnassignedDropTarget(controller, historyContainer);
  };

  ns.redistributeSidebarChats = function redistributeSidebarChats({
    controller,
    nav,
    historyContainer,
    folderContainers,
    state
  }) {
    const anchors = ns.collectVisibleNativeConversationAnchors(nav);
    const assignments = state?.assignments || {};
    const conversationCatalog = state?.conversationCatalog || {};
    const anchorsByConversationId = new Map();
    const orderedConversationIds = [];

    for (const children of folderContainers.values()) {
      const emptyState = ns.getLocalFolderEmptyState(children);
      if (emptyState) {
        children.appendChild(emptyState);
      }
    }

    for (const anchor of anchors) {
      const conversationId = ns.getConversationIdFromHref(anchor.getAttribute("href") || "");
      if (!conversationId) continue;

      ns.prepareConversationAnchor(controller, anchor, conversationId);
      anchorsByConversationId.set(conversationId, anchor);
      orderedConversationIds.push(conversationId);
    }

    const cachedConversationIds = Object.values(conversationCatalog)
      .filter((entry) => entry?.id && !anchorsByConversationId.has(entry.id))
      .sort((left, right) => {
        const rightTime = new Date(right?.lastSeenAt || 0).getTime();
        const leftTime = new Date(left?.lastSeenAt || 0).getTime();
        if (rightTime !== leftTime) return rightTime - leftTime;
        return String(left?.title || "").localeCompare(String(right?.title || ""));
      })
      .map((entry) => entry.id);

    for (const conversationId of [...orderedConversationIds, ...cachedConversationIds]) {
      const anchor =
        anchorsByConversationId.get(conversationId) ||
        ns.createCachedConversationAnchor(controller, state, conversationId);
      if (!anchor) continue;

      ns.prepareConversationAnchor(controller, anchor, conversationId);

      const assignedFolderId = assignments[conversationId]?.folderId || "";
      const targetContainer = folderContainers.get(assignedFolderId) || historyContainer;
      if (anchor.parentElement !== targetContainer) {
        targetContainer.appendChild(anchor);
      }
    }

    for (const children of folderContainers.values()) {
      const emptyState = ns.getLocalFolderEmptyState(children);
      if (!emptyState) continue;
      const hasVisibleContent = Array.from(children.children).some((child) => {
        if (child === emptyState) return false;
        if (child.matches?.('a[href*="/c/"]')) return true;
        return child.matches?.(`.${ns.SIDEBAR_FOLDER_CLASSES.folderBlock}`);
      });
      emptyState.hidden = hasVisibleContent;
    }
  };

  ns.collectVisibleNativeConversationAnchors = function collectVisibleNativeConversationAnchors(root) {
    return Array.from(root.querySelectorAll('a[data-sidebar-item="true"][href*="/c/"]')).filter(
      (anchor) => anchor.dataset.cgcaCached !== "true"
    );
  };

  ns.collectVisibleNativeConversationItems = function collectVisibleNativeConversationItems(root) {
    return ns.collectVisibleNativeConversationAnchors(root)
      .map((anchor) => {
        const id = ns.getConversationIdFromHref(anchor.getAttribute("href") || "");
        if (!id) return null;
        return {
          id,
          title: ns.getConversationTitleFromAnchor(anchor) || "Untitled",
          url: ns.getConversationAbsoluteUrl(anchor)
        };
      })
      .filter(Boolean);
  };

  ns.prepareConversationAnchor = function prepareConversationAnchor(controller, anchor, conversationId) {
    anchor.dataset.cgcaConversationId = conversationId;
    anchor.draggable = true;

    if (!anchor.dataset.cgcaDragBound) {
      anchor.dataset.cgcaDragBound = "true";
      anchor.addEventListener("dragstart", (event) => controller.handleDragStart(anchor, event));
      anchor.addEventListener("dragend", () => controller.handleDragEnd(anchor));
    }
  };

  ns.createCachedConversationAnchor = function createCachedConversationAnchor(
    controller,
    state,
    conversationId
  ) {
    const entry = ns.getConversationCatalogEntry(state, conversationId);
    if (!entry?.url) return null;

    const anchor = document.createElement("a");
    anchor.href = entry.url;
    anchor.className = `group __menu-item hoverable gap-1.5 w-full ${ns.SIDEBAR_FOLDER_CLASSES.cachedConversation}`;
    anchor.dataset.sidebarItem = "true";
    anchor.dataset.cgcaCached = "true";
    anchor.dataset.cgcaConversationId = conversationId;
    anchor.title = entry.title || "Untitled";

    const body = document.createElement("div");
    body.className = "flex min-w-0 grow items-center gap-2.5";

    const label = document.createElement("div");
    label.className = `truncate ${ns.SIDEBAR_FOLDER_CLASSES.cachedConversationLabel}`;
    label.textContent = entry.title || "Untitled";
    body.appendChild(label);

    anchor.appendChild(body);
    ns.prepareConversationAnchor(controller, anchor, conversationId);
    return anchor;
  };

  ns.getConversationCatalogEntry = function getConversationCatalogEntry(state, conversationId) {
    const directEntry = state?.conversationCatalog?.[conversationId];
    if (directEntry) {
      return directEntry;
    }

    const assignment = state?.assignments?.[conversationId];
    if (!assignment) {
      return null;
    }

    return {
      id: conversationId,
      title: assignment.title || "Untitled",
      url: assignment.url || `https://chatgpt.com/c/${conversationId}`
    };
  };

  ns.getLocalFolderEmptyState = function getLocalFolderEmptyState(container) {
    if (!container) return null;
    return Array.from(container.children).find((child) =>
      child.classList?.contains(ns.SIDEBAR_FOLDER_CLASSES.emptyState)
    ) || null;
  };

  ns.bindFolderDropTarget = function bindFolderDropTarget({ controller, element, folderId, targetKey }) {
    if (element.dataset.cgcaDropBound === "true") {
      return;
    }

    element.dataset.cgcaDropBound = "true";
    element.addEventListener("dragenter", (event) => {
      event.preventDefault();
      event.stopPropagation();
      controller.setDragTarget(targetKey);
    });
    element.addEventListener("dragover", (event) => {
      event.preventDefault();
      event.stopPropagation();
      controller.setDragTarget(targetKey);
    });
    element.addEventListener("dragleave", (event) => {
      event.stopPropagation();
      if (event.currentTarget === event.target) {
        controller.setDragTarget("");
      }
    });
    element.addEventListener("drop", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      controller.setDragTarget(targetKey);
      if (controller.dragFolderId) {
        await controller.moveDraggedFolder(folderId);
        return;
      }
      await controller.assignDraggedConversation(folderId);
    });
  };

  ns.bindUnassignedDropTarget = function bindUnassignedDropTarget(controller, element) {
    if (element.dataset.cgcaUnassignedBound === "true") {
      return;
    }

    element.dataset.cgcaUnassignedBound = "true";
    element.addEventListener("dragenter", (event) => {
      event.preventDefault();
      event.stopPropagation();
      controller.setDragTarget("unassigned");
    });
    element.addEventListener("dragover", (event) => {
      event.preventDefault();
      event.stopPropagation();
      controller.setDragTarget("unassigned");
    });
    element.addEventListener("dragleave", (event) => {
      event.stopPropagation();
      if (event.currentTarget === event.target) {
        controller.setDragTarget("");
      }
    });
    element.addEventListener("drop", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      await controller.clearDraggedConversationFolder();
    });
  };

  ns.normalizeParentFolderId = function normalizeParentFolderId(value) {
    const normalized = String(value || "").trim();
    return normalized || null;
  };

  ns.buildFolderTree = function buildFolderTree(folders) {
    const folderById = new Map();
    const childrenById = new Map();
    const depthById = new Map();
    const sortedFolders = [...(folders || [])].sort((left, right) => {
      const leftParent = ns.normalizeParentFolderId(left?.parentFolderId) || "";
      const rightParent = ns.normalizeParentFolderId(right?.parentFolderId) || "";
      const parentDelta = leftParent.localeCompare(rightParent);
      if (parentDelta !== 0) return parentDelta;
      const orderDelta = (Number(left?.order) || 0) - (Number(right?.order) || 0);
      if (orderDelta !== 0) return orderDelta;
      return String(left?.name || "").localeCompare(String(right?.name || ""));
    });

    for (const folder of sortedFolders) {
      if (!folder?.id) continue;
      folderById.set(folder.id, folder);
      childrenById.set(folder.id, []);
    }

    const roots = [];
    for (const folder of sortedFolders) {
      if (!folder?.id) continue;
      const parentFolderId = ns.resolveRenderableParentFolderId(folderById, folder);
      if (!parentFolderId) {
        roots.push(folder);
        depthById.set(folder.id, 0);
        continue;
      }
      childrenById.get(parentFolderId)?.push(folder);
      depthById.set(folder.id, (depthById.get(parentFolderId) || 0) + 1);
    }

    return {
      roots,
      folderById,
      childrenById,
      depthById
    };
  };

  ns.resolveRenderableParentFolderId = function resolveRenderableParentFolderId(folderById, folder) {
    const immediateParentId = ns.normalizeParentFolderId(folder?.parentFolderId);
    if (!immediateParentId) return null;
    if (!folderById.has(immediateParentId)) return null;

    let cursorId = immediateParentId;
    const seen = new Set([folder.id]);
    while (cursorId) {
      if (seen.has(cursorId)) {
        return null;
      }
      seen.add(cursorId);
      const current = folderById.get(cursorId);
      cursorId = ns.normalizeParentFolderId(current?.parentFolderId);
    }

    return immediateParentId;
  };

  ns.collectDescendantFolderIds = function collectDescendantFolderIds(tree, folderId, acc = new Set()) {
    for (const child of tree.childrenById.get(folderId) || []) {
      if (acc.has(child.id)) continue;
      acc.add(child.id);
      ns.collectDescendantFolderIds(tree, child.id, acc);
    }
    return acc;
  };

  ns.countAssignedChats = function countAssignedChats(state, tree, folderId) {
    const visibleFolderIds = new Set([folderId, ...ns.collectDescendantFolderIds(tree, folderId)]);
    return Object.values(state?.assignments || {}).filter((assignment) =>
      visibleFolderIds.has(assignment?.folderId)
    ).length;
  };

  ns.createSectionChevron = function createSectionChevron(isExpanded) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    svg.setAttribute("width", "16");
    svg.setAttribute("height", "16");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("class", "invisible h-3 w-3 shrink-0 group-hover/sidebar-expando-section:visible");
    svg.setAttribute("viewBox", "0 0 16 16");

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("fill", "currentColor");
    path.setAttribute("d", isExpanded ? "M4.5 6l3.5 4 3.5-4z" : "M6 4.5l4 3.5-4 3.5z");
    svg.appendChild(path);
    return svg;
  };

  ns.createGrowLabel = function createGrowLabel(text, className = "") {
    const wrapper = document.createElement("div");
    wrapper.className = "flex min-w-0 grow items-center gap-2.5";

    const label = document.createElement("div");
    label.className = `truncate ${className}`.trim();
    label.textContent = text;
    wrapper.appendChild(label);

    return wrapper;
  };

  ns.createMenuIcon = function createMenuIcon(svg) {
    const wrapper = document.createElement("div");
    wrapper.className = "flex items-center justify-center group-disabled:opacity-50 group-data-disabled:opacity-50 icon";
    wrapper.appendChild(svg);
    return wrapper;
  };

  ns.createFolderToggleIcon = function createFolderToggleIcon(isExpanded) {
    const wrapper = document.createElement("div");
    wrapper.className = "cgca-folder-caret";
    wrapper.setAttribute("aria-hidden", "true");
    wrapper.dataset.expanded = isExpanded ? "true" : "false";
    wrapper.appendChild(
      ns.createIconSvg(
        "M7.03 4.97a.75.75 0 0 1 1.06 0l4 4a.75.75 0 0 1 0 1.06l-4 4a.75.75 0 1 1-1.06-1.06L10.5 9.5 7.03 6.03a.75.75 0 0 1 0-1.06Z"
      )
    );
    return wrapper;
  };

  ns.createFolderGlyph = function createFolderGlyph() {
    return ns.createIconSvg(
      "M2.5 5.25c0-1.38 0-2.07.27-2.6a2.5 2.5 0 0 1 1.09-1.09c.53-.27 1.22-.27 2.6-.27h.53c.2 0 .3 0 .39.01.38.03.74.18 1.03.43.07.06.14.13.28.27l.42.42c.14.14.21.2.28.26.29.26.65.4 1.03.43.1.01.2.01.39.01h.67c1.38 0 2.07 0 2.6.27.47.24.85.62 1.09 1.09.27.53.27 1.22.27 2.6v.5c0 1.86 0 2.79-.36 3.5-.31.6-.8 1.09-1.4 1.4-.71.36-1.64.36-3.5.36H6.35c-1.86 0-2.79 0-3.5-.36a3.25 3.25 0 0 1-1.4-1.4c-.36-.71-.36-1.64-.36-3.5v-1.5Z"
    );
  };

  ns.createPlusGlyph = function createPlusGlyph() {
    return ns.createIconSvg(
      "M8 3.5a.75.75 0 0 1 .75.75v3h3a.75.75 0 0 1 0 1.5h-3v3a.75.75 0 0 1-1.5 0v-3h-3a.75.75 0 0 1 0-1.5h3v-3A.75.75 0 0 1 8 3.5Z"
    );
  };

  ns.createMoreGlyph = function createMoreGlyph() {
    return ns.createIconSvg(
      "M3.25 8a1.25 1.25 0 1 0 2.5 0 1.25 1.25 0 0 0-2.5 0Zm4.75 0a1.25 1.25 0 1 0 2.5 0 1.25 1.25 0 0 0-2.5 0Zm4.75 0a1.25 1.25 0 1 0 2.5 0 1.25 1.25 0 0 0-2.5 0Z"
    );
  };

  ns.createIconSvg = function createIconSvg(pathData) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    svg.setAttribute("width", "20");
    svg.setAttribute("height", "20");
    svg.setAttribute("viewBox", "0 0 20 20");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("class", "icon");

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("fill", "currentColor");
    path.setAttribute("d", pathData);
    svg.appendChild(path);
    return svg;
  };

  ns.ensureSidebarFolderStyles = function ensureSidebarFolderStyles() {
    if (document.getElementById("cgca-sidebar-folder-styles")) {
      return;
    }

    const classes = ns.SIDEBAR_FOLDER_CLASSES;
    const style = document.createElement("style");
    style.id = "cgca-sidebar-folder-styles";
    style.textContent = `
      .${classes.section} { position: relative; }
      .${classes.folderBlock} { display: block; }
      .${classes.createForm} {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto auto;
        gap: 0.5rem;
        padding: 0.25rem 0.75rem 0.5rem;
      }
      .${classes.createInput} {
        min-width: 0;
        height: 2rem;
        border: 1px solid rgba(0, 0, 0, 0.08);
        border-radius: 0.75rem;
        padding: 0 0.75rem;
        background: var(--bg-primary, #fff);
        color: inherit;
        font: inherit;
      }
      .${classes.createSubmit},
      .${classes.createCancel} {
        height: 2rem;
        border: 1px solid rgba(0, 0, 0, 0.08);
        border-radius: 0.75rem;
        padding: 0 0.75rem;
        background: var(--bg-primary, #fff);
        color: inherit;
        font: inherit;
        cursor: pointer;
      }
      .${classes.folderRow} {
        cursor: pointer;
        user-select: none;
      }
      .${classes.folderToggleButton} {
        display: flex;
        min-width: 0;
        flex: 1 1 auto;
        align-items: center;
        gap: 0.375rem;
        border: 0;
        padding: 0;
        background: transparent;
        color: inherit;
        font: inherit;
        text-align: left;
        cursor: pointer;
      }
      .${classes.folderRowExpanded} {
        background: rgba(0, 0, 0, 0.035);
      }
      .${classes.folderRowBody} {
        min-width: 0;
      }
      .${classes.folderTrailing} {
        display: inline-flex;
        flex: 0 0 auto;
        align-items: center;
        gap: 0.35rem;
        margin-left: 0.35rem;
      }
      .cgca-folder-caret {
        display: inline-flex;
        width: 1rem;
        height: 1rem;
        flex: 0 0 1rem;
        align-items: center;
        justify-content: center;
        color: var(--text-tertiary, #6b7280);
        opacity: 0.9;
        transition: transform 140ms ease, color 140ms ease, opacity 140ms ease;
      }
      .cgca-folder-caret > svg {
        width: 0.9rem;
        height: 0.9rem;
      }
      .cgca-folder-caret[data-expanded="true"] {
        transform: rotate(90deg);
        color: var(--text-primary, rgba(17, 24, 39, 0.9));
        opacity: 1;
      }
      .${classes.count} {
        display: inline-flex;
        flex: 0 0 auto;
        align-items: center;
        justify-content: center;
        min-width: 1.35rem;
        height: 1.35rem;
        padding: 0 0.42rem;
        border-radius: 999px;
        background: rgba(0, 0, 0, 0.045);
        color: var(--text-tertiary, #6b7280);
        font-size: 11px;
        font-variant-numeric: tabular-nums;
        line-height: 1;
      }
      .${classes.menuWrap} {
        display: inline-flex;
        flex: 0 0 auto;
        position: relative;
        align-items: center;
        justify-content: center;
      }
      .${classes.menuPanel} {
        position: absolute;
        top: calc(100% + 0.35rem);
        right: 0;
        z-index: 12;
        min-width: 10.5rem;
        padding: 0.35rem;
        border: 1px solid rgba(0, 0, 0, 0.06);
        border-radius: 0.9rem;
        background: var(--bg-elevated-secondary, rgba(255, 255, 255, 0.9));
        box-shadow:
          0 10px 28px rgba(15, 23, 42, 0.08),
          0 2px 8px rgba(15, 23, 42, 0.04);
        backdrop-filter: blur(10px);
      }
      .${classes.menuActions},
      .${classes.renameForm} {
        display: grid;
        gap: 0.3rem;
      }
      .${classes.menuActionsInline} {
        display: flex;
        flex-wrap: wrap;
        gap: 0.45rem;
      }
      .${classes.menuAction},
      .${classes.renameInput} {
        border-radius: 0.75rem;
        color: inherit;
        font: inherit;
      }
      .${classes.menuAction} {
        display: flex;
        width: 100%;
        align-items: center;
        justify-content: flex-start;
        border: 0;
        padding: 0.55rem 0.7rem;
        background: transparent;
        font-size: 13px;
        line-height: 1.2;
        cursor: pointer;
        transition: background-color 120ms ease, color 120ms ease;
      }
      .${classes.menuAction}:hover {
        background: rgba(0, 0, 0, 0.045);
      }
      .${classes.menuActionsInline} > .${classes.menuAction} {
        width: auto;
        min-width: 0;
        border: 1px solid rgba(0, 0, 0, 0.06);
        padding-inline: 0.75rem;
        background: var(--bg-primary, rgba(255, 255, 255, 0.82));
      }
      .${classes.menuActionDanger} {
        color: #b42318;
      }
      .${classes.menuActionDanger}:hover {
        background: rgba(180, 35, 24, 0.08);
      }
      .${classes.renameInput} {
        height: 2rem;
        min-width: 0;
        border: 1px solid rgba(0, 0, 0, 0.08);
        background: var(--bg-primary, #fff);
        padding: 0 0.75rem;
        font-size: 13px;
      }
      .${classes.menuNotice} {
        padding: 0.1rem 0.2rem 0.45rem;
        color: var(--text-tertiary, #6b7280);
        font-size: 12px;
        line-height: 1.4;
      }
      .${classes.folderChildren} {
        padding-left: 1.75rem;
      }
      .${classes.folderChildren} > a {
        margin-top: 2px;
      }
      .${classes.cachedConversation} {
        display: flex;
        min-width: 0;
        align-items: center;
      }
      .${classes.cachedConversationLabel} {
        min-width: 0;
      }
      .${classes.emptyState} {
        padding: 0.25rem 1rem 0.5rem 2.25rem;
        color: var(--text-tertiary, #6b7280);
        font-size: 12px;
      }
      .${classes.folderRowDropTarget},
      .${classes.folderChildrenDropTarget},
      .${classes.unassignedDropTarget} {
        background: rgba(15, 118, 110, 0.08);
        outline: 1px solid rgba(15, 118, 110, 0.18);
      }
      .${classes.folderChildrenDropTarget} {
        border-radius: 0.75rem;
      }
      a.${classes.dragging} {
        opacity: 0.55;
      }
      .${classes.menuButton} {
        display: inline-flex;
        flex: 0 0 auto;
        height: 1.9rem;
        width: 1.9rem;
        align-items: center;
        justify-content: center;
        border-radius: 999px;
        color: inherit;
        opacity: 0.82;
        cursor: pointer;
        transition: background-color 120ms ease, opacity 120ms ease;
      }
      .${classes.menuButton}:hover,
      .${classes.menuButton}[aria-expanded="true"] {
        background: rgba(0, 0, 0, 0.06);
        opacity: 1;
      }
    `;

    document.head.appendChild(style);
  };
})();
